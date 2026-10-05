#!/usr/bin/env node
// Idempotent DB bootstrap/migration runner — safe to run on every deploy.
//
//   - Fresh database (no `quizzes` table yet): applies the whole of
//     db/schema.sql, then records every file already in db/migrations/ as
//     applied, since a fresh schema.sql reflects all of them already.
//   - Existing database: applies whichever db/migrations/*.sql files are
//     not yet recorded in `schema_migrations`, in filename order, and
//     records each as it succeeds.
//
// Usage: node db/migrate.js   (reads DB_* from .env via dotenv/config)
//
// Migration file convention: plain DDL, one or a few statements separated
// by `;`, comments on their own `--` lines. Statements are executed one at
// a time (no `multipleStatements` on the pool) — don't rely on semicolons
// inside string literals.

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

function log(...args) {
  console.log('[migrate]', ...args);
}

// Strips full-line `--` comments, then splits on `;` — sufficient for this
// project's DDL-only files, which never use semicolons inside a comment or
// a string literal.
function splitStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
    [name]
  );
  return rows.length > 0;
}

// Matches only real migration files (e.g. "001_add_publish_date.sql") — not
// ".sql"-suffixed junk like macOS's "._foo.sql" AppleDouble sidecar files,
// which a plain .endsWith('.sql') check would wrongly pick up (and which
// then sort *before* the real file numerically, since '.' < '0').
function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
}

async function main() {
  const conn = await pool.getConnection();
  try {
    await ensureMigrationsTable(conn);
    const files = migrationFiles();
    const fresh = !(await tableExists(conn, 'quizzes'));

    if (fresh) {
      log('No `quizzes` table found — bootstrapping from db/schema.sql');
      for (const stmt of splitStatements(fs.readFileSync(SCHEMA_FILE, 'utf-8'))) {
        await conn.query(stmt);
      }
      for (const f of files) {
        await conn.query('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [f]);
      }
      log(`Bootstrapped schema; marked ${files.length} migration(s) as already applied.`);
      return;
    }

    let appliedCount = 0;
    for (const f of files) {
      const [[already]] = await conn.query('SELECT 1 AS ok FROM schema_migrations WHERE filename = ?', [f]);
      if (already) { log(`skip  ${f} (already applied)`); continue; }
      log(`apply ${f}`);
      for (const stmt of splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'))) {
        await conn.query(stmt);
      }
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [f]);
      appliedCount++;
    }
    log(appliedCount ? `Applied ${appliedCount} migration(s).` : 'Up to date — nothing to apply.');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err);
  process.exit(1);
});
