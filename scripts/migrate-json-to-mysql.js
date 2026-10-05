#!/usr/bin/env node
// One-time migration: data/db.json -> MySQL (schema in db/schema.sql).
// Usage:
//   node scripts/migrate-json-to-mysql.js            # normal run, refuses non-empty target
//   node scripts/migrate-json-to-mysql.js --force-wipe   # TRUNCATE target tables first (dev reseeding)
//
// Reads DB_* connection info from .env (see .env.example). Points at
// whichever database that .env's DB_NAME names — same script for the dev
// rehearsal DB and the real production cutover, only the .env differs.

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'db.json');
const FORCE_WIPE = process.argv.includes('--force-wipe');
const COUNTER_NAME = 'quiz_number';

function log(...args) {
  console.log('[migrate]', ...args);
}

function loadSource() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Data file not found: ${DATA_FILE}`);
  }
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (!Array.isArray(raw.quizzes) || !Array.isArray(raw.submissions) || typeof raw.nextNumber !== 'number') {
    throw new Error(`${DATA_FILE} does not match the expected {nextNumber, quizzes, submissions} shape`);
  }
  return raw;
}

function preflight(raw) {
  const { quizzes, submissions } = raw;
  const slugs = new Set(quizzes.map((q) => q.slug));
  const totalQuestions = quizzes.reduce((n, q) => n + (q.questions?.length || 0), 0);

  const orphanSlugs = submissions.filter((s) => !slugs.has(s.quizSlug));
  const seenPairs = new Map(); // "slug|lowerEmail" -> count
  for (const s of submissions) {
    const key = `${s.quizSlug}|${(s.email || '').trim().toLowerCase()}`;
    seenPairs.set(key, (seenPairs.get(key) || 0) + 1);
  }
  const duplicatePairs = [...seenPairs.values()].filter((c) => c > 1).length;

  const missingDuration = submissions.filter((s) => s.durationMs == null).length;
  const missingFollow = submissions.filter((s) => s.followConfirmed == null).length;
  const missingIp = submissions.filter((s) => s.ip == null).length;
  const missingQuestionIds = submissions.filter((s) => s.questionIds == null).length;

  log('--- Pre-flight report ---');
  log(`quizzes: ${quizzes.length}`);
  log(`questions (total across quizzes): ${totalQuestions}`);
  log(`submissions: ${submissions.length}`);
  log(`submissions with quizSlug not matching any quiz (orphans, expected to be kept): ${orphanSlugs.length}`, orphanSlugs.map((s) => s.quizSlug));
  log(`(quizSlug, email) pairs appearing more than once (expected to be kept, no unique constraint): ${duplicatePairs}`);
  log(`submissions missing durationMs (-> NULL): ${missingDuration}`);
  log(`submissions missing followConfirmed (-> FALSE): ${missingFollow}`);
  log(`submissions missing ip (-> NULL): ${missingIp}`);
  log(`submissions missing questionIds (-> NULL): ${missingQuestionIds}`);
  log('--- end pre-flight report ---');

  return { totalQuestions };
}

async function assertEmptyOrWipe(conn) {
  const [[{ c: quizCount }]] = await conn.query('SELECT COUNT(*) AS c FROM quizzes');
  const [[{ c: subCount }]] = await conn.query('SELECT COUNT(*) AS c FROM submissions');
  if (quizCount === 0 && subCount === 0) return;

  if (!FORCE_WIPE) {
    throw new Error(
      `Target database already has data (quizzes=${quizCount}, submissions=${subCount}). ` +
      `Refusing to import on top of it. Pass --force-wipe to truncate and reimport (use only for the dev DB).`
    );
  }
  log(`--force-wipe passed: truncating existing tables (quizzes=${quizCount}, submissions=${subCount})`);
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  await conn.query('TRUNCATE TABLE questions');
  await conn.query('TRUNCATE TABLE submissions');
  await conn.query('TRUNCATE TABLE quizzes');
  await conn.query('TRUNCATE TABLE app_counters');
  await conn.query('SET FOREIGN_KEY_CHECKS=1');
}

async function importData(conn, raw) {
  const { nextNumber, quizzes, submissions } = raw;

  for (const q of quizzes) {
    await conn.query(
      `INSERT INTO quizzes (slug, category, title, active, display_count)
       VALUES (?, ?, ?, ?, ?)`,
      [q.slug, q.category, q.title, q.active !== false, q.displayCount ?? 0]
    );

    const questions = q.questions || [];
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      await conn.query(
        `INSERT INTO questions (quiz_slug, legacy_id, position, text, options, correct_index)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [q.slug, question.id, i, question.text, JSON.stringify(question.options), question.correctIndex]
      );
    }
  }
  log(`Inserted ${quizzes.length} quizzes.`);

  await conn.query(
    `INSERT INTO app_counters (name, next_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE next_value = VALUES(next_value)`,
    [COUNTER_NAME, nextNumber]
  );
  log(`Seeded app_counters.${COUNTER_NAME} = ${nextNumber}`);

  const BATCH_SIZE = 200;
  for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
    const batch = submissions.slice(i, i + BATCH_SIZE);
    const rows = batch.map((s) => [
      s.id ?? null,
      s.quizSlug,
      s.quizTitle ?? '',
      s.name ?? '',
      s.email ?? '',
      s.mobile ?? '',
      !!s.followConfirmed,
      JSON.stringify(s.answers ?? []),
      s.questionIds == null ? null : JSON.stringify(s.questionIds),
      s.score,
      s.total,
      s.durationMs == null ? null : s.durationMs,
      new Date(s.timestamp),
      s.ip ?? null,
    ]);
    await conn.query(
      `INSERT INTO submissions
         (legacy_id, quiz_slug, quiz_title, name, email, mobile, follow_confirmed,
          answers, question_ids, score, total, duration_ms, timestamp, ip)
       VALUES ?`,
      [rows]
    );
    log(`Inserted submissions ${i + 1}-${Math.min(i + BATCH_SIZE, submissions.length)} of ${submissions.length}`);
  }
}

async function verify(conn, raw, totalQuestions) {
  const { quizzes, submissions } = raw;
  let ok = true;
  const check = (label, pass, detail) => {
    console.log(`  [${pass ? 'OK' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
    if (!pass) ok = false;
  };

  const [[{ c: quizCount }]] = await conn.query('SELECT COUNT(*) AS c FROM quizzes');
  check('quiz count matches source', quizCount === quizzes.length, `db=${quizCount} source=${quizzes.length}`);

  const [[{ c: questionCount }]] = await conn.query('SELECT COUNT(*) AS c FROM questions');
  check('question count matches source', questionCount === totalQuestions, `db=${questionCount} source=${totalQuestions}`);

  const [[{ c: subCount }]] = await conn.query('SELECT COUNT(*) AS c FROM submissions');
  check('submission count matches source', subCount === submissions.length, `db=${subCount} source=${submissions.length}`);

  const [rows] = await conn.query('SELECT quiz_slug, COUNT(*) AS c FROM questions GROUP BY quiz_slug');
  const dbCounts = Object.fromEntries(rows.map((r) => [r.quiz_slug, r.c]));
  let perQuizOk = true;
  for (const q of quizzes) {
    const expected = q.questions?.length || 0;
    const actual = dbCounts[q.slug] || 0;
    if (expected !== actual) {
      perQuizOk = false;
      console.log(`    mismatch: ${q.slug} expected=${expected} actual=${actual}`);
    }
  }
  check('per-quiz question counts match', perQuizOk);

  const sourceScoreSum = submissions.reduce((n, s) => n + (s.score || 0), 0);
  const sourceTotalSum = submissions.reduce((n, s) => n + (s.total || 0), 0);
  const [[{ scoreSum, totalSum }]] = await conn.query(
    'SELECT COALESCE(SUM(score),0) AS scoreSum, COALESCE(SUM(total),0) AS totalSum FROM submissions'
  );
  check('SUM(score) matches source', Number(scoreSum) === sourceScoreSum, `db=${scoreSum} source=${sourceScoreSum}`);
  check('SUM(total) matches source', Number(totalSum) === sourceTotalSum, `db=${totalSum} source=${sourceTotalSum}`);

  // Spot-check the known orphan (if the source data still has one) survived.
  const orphan = submissions.find((s) => !quizzes.some((q) => q.slug === s.quizSlug));
  if (orphan) {
    const [[row]] = await conn.query('SELECT COUNT(*) AS c FROM submissions WHERE legacy_id = ?', [orphan.id]);
    check(`orphan submission (quizSlug=${orphan.quizSlug}) survived import`, row.c === 1);
  }

  const [[{ c: counterCount }]] = await conn.query('SELECT next_value AS c FROM app_counters WHERE name = ?', [COUNTER_NAME]);
  check('app_counters seeded correctly', counterCount === raw.nextNumber, `db=${counterCount} source=${raw.nextNumber}`);

  return ok;
}

async function main() {
  const raw = loadSource();
  const { totalQuestions } = preflight(raw);

  const conn = await pool.getConnection();
  try {
    await assertEmptyOrWipe(conn);

    await conn.beginTransaction();
    try {
      await importData(conn, raw);
      await conn.commit();
      log('Transaction committed.');
    } catch (err) {
      await conn.rollback();
      log('Import failed, rolled back. Nothing was written.');
      throw err;
    }

    log('--- Verification ---');
    const ok = await verify(conn, raw, totalQuestions);
    log('--- end verification ---');

    if (!ok) {
      console.error('\nVerification FAILED — do not treat this database as trustworthy yet.');
      process.exitCode = 1;
    } else {
      log('All verification checks passed.');
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] FATAL:', err);
  process.exitCode = 1;
});
