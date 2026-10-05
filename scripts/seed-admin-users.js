#!/usr/bin/env node
// One-time (idempotent — safe to re-run) seed for the initial admin
// accounts. Deliberately does NOT hardcode passwords in this file, even
// though it's only ever meant to seed two specific accounts — this file
// gets synced to the server like any other source file, and a committed
// script is not where a plaintext password should live, even briefly.
// Usage:
//   SEED_ADMIN_PASSWORD='...' SEED_SUPERADMIN_PASSWORD='...' node scripts/seed-admin-users.js
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';

const SEEDS = [
  { username: 'admin', role: 'admin', password: process.env.SEED_ADMIN_PASSWORD },
  { username: 'super-admin', role: 'super_admin', password: process.env.SEED_SUPERADMIN_PASSWORD },
];

async function main() {
  const missing = SEEDS.filter((s) => !s.password).map((s) => s.username);
  if (missing.length) {
    console.error(`[seed] Missing password env var for: ${missing.join(', ')}`);
    console.error('[seed] Set SEED_ADMIN_PASSWORD and SEED_SUPERADMIN_PASSWORD and re-run.');
    process.exit(1);
  }

  for (const { username, role, password } of SEEDS) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)`,
      [username, hash, role]
    );
    console.log(`[seed] upserted ${username} (${role})`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
