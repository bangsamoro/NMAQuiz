# Deploying

Deploys are pushed from your local machine to the server over `rsync`/`ssh`
— there's no git on the server. The panel is **Webuzo**, but this app is
**not** managed through it — see below.

- Server: `187.127.124.99`
- URL: `https://sulutions.cloud/NMAWebinar`
- App path: `/home/sulutions_cloud/public_html/NMAWebinar`
- Database: `sulutions_cloud_NMAWebinar_DB`, user `sulutions_cloud_NMAWebinar_User`

## How this app actually runs (found the hard way, 2026-08-21)

**There is no process supervisor.** Confirmed directly on the server: no
PM2 process for this app, no systemd unit, no cron `@reboot` entry, and
Webuzo's own Application Manager lists **"No application exist"** for this
account — it was never registered there. It's a bare `node server.js`
someone started by hand at some point and left running. Nothing restarts
it if it dies, and nothing restarts it when new code is deployed either —
Node doesn't hot-reload, so files changing on disk has zero effect on the
already-running process until something explicitly kills and restarts it.
`scripts/restart-app.sh` is that "something" — `deploy.sh` runs it as the
last step, every time.

**Routing is a hand-written `.htaccess`, not Passenger.** Apache proxies
`/NMAWebinar/*` to the Node process via a `RewriteRule ... [P,L]` reverse
proxy in `/home/sulutions_cloud/public_html/NMAWebinar/.htaccess`, matching
the same pattern used by sibling apps on this account (compare
`.../mahardika4/.htaccess`). A reference copy is kept at
`server-htaccess.reference` in this repo — **it is deliberately excluded
from every sync** (`deploy.sh`'s rsync excludes `/.htaccess`), because an
early deploy once ran `rsync --delete` without that exclusion and silently
deleted the real one, taking the whole app down (Apache fell back to
serving a static `index.html` for the bare root path and its own 404 for
everything else — looked like the app was half-working, when Node wasn't
being reached by any request at all). If this file is ever missing again,
recreate it from `server-htaccess.reference` (port must match `PORT` in
`.env` — currently `3002`).

**The raw source `index.html`** (Vite's unbuilt template, referencing
`/src/main.jsx`) is also excluded from sync (`--exclude '/index.html'`,
anchored to the repo root only — `dist/index.html`, the real built output,
still syncs normally). Apache's `DirectoryIndex` would otherwise serve that
raw file directly for the bare `/NMAWebinar/` path, bypassing the app
entirely — this is also why `.htaccess` has `DirectoryIndex disabled` in
it.

## One-time setup (this machine)

```bash
cp deploy.config.sh.example deploy.config.sh
```

Edit `deploy.config.sh` if needed:
- `DEPLOY_HOST` — defaults to `root@187.127.124.99`.
- `SSH_KEY` — optional, points at a dedicated deploy key
  (`~/.ssh/id_ed25519_nmawebinar`, passphrase-less) so `deploy.sh` never
  stops for a password/passphrase prompt. Install its public key in
  `/root/.ssh/authorized_keys` on the server if you haven't already.
- `DEPLOY_PATH` — already set to the confirmed real path,
  `/home/sulutions_cloud/public_html/NMAWebinar`.

Nothing needs to be created on the server — `.env`, the database, and its
data already exist. `deploy.sh` still refuses to run if it can't find a
`.env` at `DEPLOY_PATH`, as a safety check in case `DEPLOY_PATH` is wrong.

## Deploying

```bash
./deploy.sh
```

This, in order:
1. Builds the frontend locally (`npm ci && npm run build`).
2. Checks the server has a `.env` — aborts if not.
3. Rsyncs everything up, except secrets, dependencies, uploaded images,
   the server-managed `.htaccess`, the raw source `index.html`, and macOS
   AppleDouble junk files (`._*` — this local checkout lives on a mounted
   volume that generates one of these next to almost every real file; one
   of them, `._001_add_publish_date.sql`, once got synced and then matched
   `db/migrate.js`'s old loose `.sql`-suffix filter, sorted before the real
   migration alphabetically, and broke it with binary garbage instead of
   SQL — fixed both by excluding `._*` here and tightening the migration
   file filter to `^\d+_.*\.sql$`).
4. Syncs `public/img/` separately, **without** `--delete` — this folder
   holds admin-uploaded quiz banner images on the server; a normal sync
   would otherwise wipe them out on every deploy.
5. `npm ci --omit=dev` on the server.
6. Runs `chmod -R go+rX` over the whole app directory, then immediately
   re-tightens `.env` and `backups/` back to private (`chmod go-rwx`).
   Deliberately not `rsync --chown`/`--chmod`: macOS's stock `rsync` is the
   ancient 2.6.9 (no `--chown` support), and preserving *source*
   permissions (`-a`) is what caused a real 403 outage earlier — this local
   checkout's files happen to be owner-only (`rwx------`, a quirk of the
   mounted volume they live on), which became root-owned mode-700 files on
   the server, unreadable by Apache, until manually fixed.
7. Runs `db/backup.js` on the server, which `mysqldump`s the database to
   `backups/<timestamp>-pre-migrate.sql` (skip with `--no-backup`). Goes
   through Node/`dotenv` to read `DB_PASSWORD`, deliberately not a raw bash
   `source .env` — bash and dotenv parse `.env` differently, and a
   password containing `#`, `$`, quotes, or spaces would get silently
   mangled by bash's version. Credentials are passed to `mysqldump` via a
   short-lived `--defaults-extra-file`, not the `MYSQL_PWD` env var this
   used to use — found the hard way that root's `/root/.my.cnf` (its own
   unrelated MySQL password) apparently takes precedence over `MYSQL_PWD`
   for the real `mysqldump` C-client binary, so backups were silently
   authenticating as the wrong account while `db/migrate.js` (a pure-JS
   driver that never reads `.my.cnf`) worked fine with the exact same
   `.env`. If backups ever start failing with an auth error again, check
   `/root/.my.cnf` before assuming `.env` is wrong.
8. Runs `db/migrate.js` on the server — applies whatever's new in
   `db/migrations/` (tracked in a `schema_migrations` table, so safe to run
   on every deploy even when nothing's changed). Skip with `--no-migrate`.
9. Runs `scripts/restart-app.sh` on the server — finds whatever's listening
   on the app's port (from `.env`'s `PORT`), kills it, and starts a fresh
   `node server.js`, backgrounded with `nohup`. This is the step that
   actually makes new code (and schema changes) take effect — steps 1-8 on
   their own just update files and the database, the running process is
   untouched until this step.

```bash
./deploy.sh --no-migrate   # skip the DB step entirely
./deploy.sh --no-backup    # migrate, but skip the pre-migration dump
```

## One-time step after the admin-login migration (004) lands

Migration `004_add_admin_auth.sql` creates the `admin_users` /
`admin_sessions` tables, but leaves `admin_users` **empty** — nobody can
log into `/admin` at all until it's seeded, since the old shared
`ADMIN_PASSCODE` is fully retired (see `server.js` and `.env.example`).
Right after the first deploy that includes this migration, SSH in and run,
from the app directory:

```bash
SEED_ADMIN_PASSWORD='...' SEED_SUPERADMIN_PASSWORD='...' node scripts/seed-admin-users.js
```

with the real passwords for the `admin` and `super-admin` accounts. It's
idempotent (upsert by username) — safe to re-run any time you want to reset
either password, and it deliberately isn't part of `deploy.sh` itself so a
routine deploy can't silently reset a password someone's since changed.

## Adding a new DB migration later

Drop a new file in `db/migrations/`, named `NNN_description.sql` (the
migration file filter specifically requires a leading number — see the
AppleDouble note above for why). Keep it to plain DDL — a statement or two,
comments on their own `--` lines. `db/migrate.js` applies it and records it;
no manual bookkeeping needed.

## Why this app must stay a single process

Quiz attempt tokens (minted by `POST /start`, required by `POST
/submissions` to compute score/duration) live in an in-memory `Map` in
`server.js`, not the database. Since there's no process manager at all
right now, this isn't at risk from cluster-mode settings the way it would
be under PM2 — but if this app is ever migrated to a real supervisor
(PM2, systemd, Passenger via Webuzo's Application Manager), keep it to a
single instance/worker, or move that state into MySQL/Redis first.
Multiple instances splitting requests would intermittently break attempts
with an "invalid or expired session" error on submit.

## Verifying after a deploy

Visit `https://sulutions.cloud/NMAWebinar/admin` (append a `?cb=<anything>`
query param if you're checking via a tool that might cache the response),
confirm the **Publish date** field and the duplicate (copy) icon show up in
the quiz editor and sidebar, and that the publish-date filter works. Also
worth spot-checking `/api/quizzes` directly — each quiz object should have
a `publishDate` key (even if `null`) once the migration's applied.

If the site doesn't reflect the update, SSH in and check what's actually
listening on the app's port:
```bash
grep '^PORT=' /home/sulutions_cloud/public_html/NMAWebinar/.env
lsof -i :<that port>
```
and compare its start time/PID against when `deploy.sh` last ran — if
`scripts/restart-app.sh` failed silently for some reason, this is how
you'd notice.
