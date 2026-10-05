-- Adds a per-quiz link back to the live webinar the quiz covers.
-- Applied automatically by db/migrate.js (see npm run migrate / deploy.sh).
-- Column position matches schema.sql's (after publish_date) so a fresh
-- install and a migrated one end up with an identical layout.

ALTER TABLE quizzes ADD COLUMN webinar_url VARCHAR(500) NULL AFTER publish_date;
