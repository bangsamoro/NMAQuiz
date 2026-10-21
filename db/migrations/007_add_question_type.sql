-- Adds a per-question type: 'mcq' (existing behaviour, the default so every
-- current question is unchanged), 'truefalse', 'text' (typed answer graded
-- against accepted answers stored in `options`), and 'short' (typed answer,
-- never graded).
-- Applied automatically by db/migrate.js (see npm run migrate / deploy.sh).
-- Column position matches schema.sql's (after position).

ALTER TABLE questions ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'mcq' AFTER position;
