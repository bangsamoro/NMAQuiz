-- Per-quiz switch to hide the webinar details (link, Sheikh name, banner)
-- from quiz takers without deleting them. Hidden by default = off, so
-- existing quizzes behave exactly as before.
-- Applied automatically by db/migrate.js (see npm run migrate / deploy.sh).
-- Column position matches schema.sql's (after sheikh_name).

ALTER TABLE quizzes ADD COLUMN webinar_hidden BOOLEAN NOT NULL DEFAULT FALSE AFTER sheikh_name;
