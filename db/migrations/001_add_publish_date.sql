-- Adds the "publish date" field to existing quizzes.
-- Applied automatically by db/migrate.js (see npm run migrate / deploy.sh);
-- safe to also run by hand against a database created from an older
-- schema.sql. Column position matches schema.sql's (after display_count) so
-- a fresh install and a migrated one end up with an identical layout.

ALTER TABLE quizzes ADD COLUMN publish_date DATE NULL AFTER display_count;
