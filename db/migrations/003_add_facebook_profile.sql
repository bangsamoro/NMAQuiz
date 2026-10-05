-- Self-reported Facebook name/profile link, collected alongside
-- name/email/mobile on the quiz-taking form (no real Facebook Login
-- integration exists — this is honor-system, same trust level as the
-- existing "I followed the page" checkbox).
-- Applied automatically by db/migrate.js (see npm run migrate / deploy.sh).
-- Column position matches schema.sql's (after mobile) so a fresh install
-- and a migrated one end up with an identical layout.

ALTER TABLE submissions ADD COLUMN facebook_profile VARCHAR(255) NOT NULL DEFAULT '' AFTER mobile;
