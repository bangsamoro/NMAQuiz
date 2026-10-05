#!/usr/bin/env node
// Dumps the live database to backups/<timestamp>-pre-migrate.sql via
// mysqldump, with credentials loaded from process.env (via dotenv, same as
// the app itself).
//
// Credentials are passed via a short-lived --defaults-extra-file, NOT the
// MYSQL_PWD environment variable this used to use. Found the hard way
// (2026-08-21): when run as root, the real mysqldump C-client binary reads
// /root/.my.cnf, and that file's own [client] password (root's own MySQL
// password, completely unrelated to this app's DB user) apparently takes
// precedence over MYSQL_PWD — so backups were silently failing with an
// auth error while db/migrate.js (the mysql2 JS driver, which never reads
// .my.cnf at all) worked fine with the exact same .env credentials.
// --defaults-extra-file is explicitly designed to override a user's
// default option file, which MYSQL_PWD does not reliably do.
import 'dotenv/config';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BACKUPS_DIR = path.join(process.cwd(), 'backups');
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.join(BACKUPS_DIR, `${stamp}-pre-migrate.sql`);

const { DB_HOST = '127.0.0.1', DB_PORT = '3306', DB_USER, DB_PASSWORD, DB_NAME } = process.env;
if (!DB_USER || !DB_NAME) {
  console.error('[backup] DB_USER / DB_NAME missing from .env');
  process.exit(1);
}

// mode 0o600: only the owner (whoever runs this) can read the plaintext
// password while this file briefly exists.
const tmpCnf = path.join(os.tmpdir(), `nmawebinar-mysql-${process.pid}.cnf`);
fs.writeFileSync(
  tmpCnf,
  `[client]\nuser=${DB_USER}\npassword=${DB_PASSWORD || ''}\nhost=${DB_HOST}\nport=${DB_PORT}\n`,
  { mode: 0o600 }
);

try {
  const outFd = fs.openSync(outFile, 'w');
  // --defaults-extra-file must be the first argument.
  const result = spawnSync(
    'mysqldump',
    [`--defaults-extra-file=${tmpCnf}`, DB_NAME],
    { stdio: ['ignore', outFd, 'inherit'] }
  );
  fs.closeSync(outFd);

  if (result.status !== 0) {
    fs.unlinkSync(outFile); // don't leave a broken/empty dump file behind
    console.error(`[backup] mysqldump failed (exit code ${result.status})`);
    process.exit(1);
  }
  console.log(`[backup] wrote ${outFile}`);
} finally {
  fs.unlinkSync(tmpCnf);
}
