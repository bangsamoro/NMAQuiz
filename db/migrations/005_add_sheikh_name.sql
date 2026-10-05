-- Adds a per-quiz "Name of Sheikh" field, plus a reusable list of names for
-- the admin dropdown (so a newly-typed name is offered again on future
-- quizzes, not just this one). The webinar banner image itself is stored as
-- a file (public/img/<slug>-webinar.<ext>), same convention as the existing
-- Facebook-share banner — no column needed for it here.
-- Applied automatically by db/migrate.js (see npm run migrate / deploy.sh).
-- Column position matches schema.sql's (after webinar_url) so a fresh
-- install and a migrated one end up with an identical layout.

ALTER TABLE quizzes ADD COLUMN sheikh_name VARCHAR(255) NULL AFTER webinar_url;

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
