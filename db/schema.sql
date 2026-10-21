-- qquiz MySQL schema
-- Run against an empty database: mysql -u <user> -p <db> < db/schema.sql
-- utf8mb4 throughout (not utf8/utf8mb3) so emoji and full Unicode in real
-- submission data (Tagalog diacritics, etc.) round-trip correctly.

CREATE TABLE IF NOT EXISTS quizzes (
  slug           VARCHAR(64)  PRIMARY KEY,
  category       VARCHAR(32)  NOT NULL,
  title          VARCHAR(255) NOT NULL,
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  display_count  INT          NOT NULL DEFAULT 0,
  publish_date   DATE         NULL,
  webinar_url    VARCHAR(500) NULL,
  sheikh_name    VARCHAR(255) NULL,
  webinar_hidden BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  quiz_slug      VARCHAR(64) NOT NULL,
  legacy_id      VARCHAR(64) NOT NULL,
  position       INT NOT NULL,
  text           TEXT NOT NULL,
  options        JSON NOT NULL,
  correct_index  INT NOT NULL,
  UNIQUE KEY uniq_quiz_legacy (quiz_slug, legacy_id),
  KEY idx_quiz_slug (quiz_slug),
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_slug)
    REFERENCES quizzes(slug) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No FK on quiz_slug (deliberate): live data has a submission referencing a
-- deleted quiz, and the app itself keeps submissions after a quiz is
-- deleted ("for records"). A hard FK or ON DELETE SET NULL would both
-- change that existing behavior. See plan doc for the full reasoning.
CREATE TABLE IF NOT EXISTS submissions (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  legacy_id         VARCHAR(64) UNIQUE,
  quiz_slug         VARCHAR(64) NOT NULL,
  quiz_title        VARCHAR(255) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  mobile            VARCHAR(64)  NOT NULL,
  facebook_profile  VARCHAR(255) NOT NULL DEFAULT '',
  follow_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  answers           JSON NOT NULL,
  question_ids      JSON NULL,
  score             INT NOT NULL,
  total             INT NOT NULL,
  duration_ms       INT NULL,
  timestamp         DATETIME(3) NOT NULL,
  ip                VARCHAR(45) NULL,
  KEY idx_quiz_email (quiz_slug, email),
  KEY idx_quiz_mobile (quiz_slug, mobile)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Replaces the JSON file's `nextNumber` counter. Deliberately not derived
-- from MAX(slug number) at creation time — see plan doc: deleted quizzes'
-- numbers must stay retired forever, matching current behavior.
CREATE TABLE IF NOT EXISTS app_counters (
  name        VARCHAR(32) PRIMARY KEY,
  next_value  INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-row table (id is always 1) holding the admin-customizable UI
-- theme (color palette + font pairing) as JSON. Absent/empty = the app
-- falls back to its built-in default theme (see src/js/theme.js). Kept as
-- one JSON blob rather than a column per color so new theme fields never
-- need a migration.
CREATE TABLE IF NOT EXISTS site_settings (
  id          INT PRIMARY KEY DEFAULT 1,
  settings    JSON NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Named admin accounts, replacing the old single shared ADMIN_PASSCODE.
-- 'admin' can manage everything but only ever sees active quizzes;
-- 'super_admin' sees and manages every quiz regardless of status. Seeded
-- via scripts/seed-admin-users.js (passwords never live in a SQL file).
CREATE TABLE IF NOT EXISTS admin_users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(64)  UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('admin', 'super_admin') NOT NULL DEFAULT 'admin',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opaque bearer tokens rather than JWT — a row is trivially revocable
-- (delete it) and survives a deploy's app restart, unlike an in-memory
-- store (see activeAttempts in server.js for the contrasting case where
-- in-memory actually is the right call, since those are short-lived).
-- Reusable list of Sheikh names offered in the admin quiz-editor dropdown.
-- Seeded with the initial roster; an admin typing a new name adds a row
-- here too, so it's available for every quiz from then on.
CREATE TABLE IF NOT EXISTS sheikh_names (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) UNIQUE NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sheikh_names (name) VALUES
  ('Dr. Abdullah Abtahi'),
  ('Sheikh Rashed Vallena'),
  ('Sheikh Abdulkhaliq Abtahi'),
  ('Ustaza Nur-Ainee'),
  ('Ustaza Adawiya');

CREATE TABLE IF NOT EXISTS admin_sessions (
  token       CHAR(64) PRIMARY KEY,
  user_id     INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  KEY idx_user_id (user_id),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (user_id)
    REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
