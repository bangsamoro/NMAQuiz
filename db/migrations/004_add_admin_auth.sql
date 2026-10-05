-- Adds real named admin accounts + sessions, replacing the old single
-- shared ADMIN_PASSCODE. Pure DDL only — passwords are hashed in JS, not
-- something a SQL migration file can do; seed the two initial accounts
-- separately via scripts/seed-admin-users.js after this applies.
-- Applied automatically by db/migrate.js (see npm run migrate / deploy.sh).

CREATE TABLE IF NOT EXISTS admin_users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(64)  UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('admin', 'super_admin') NOT NULL DEFAULT 'admin',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token       CHAR(64) PRIMARY KEY,
  user_id     INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  KEY idx_user_id (user_id),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (user_id)
    REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
