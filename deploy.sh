#!/usr/bin/env bash
# Deploy: build locally, push to the server over rsync/ssh, install prod
# deps, back up + migrate the database, and restart the app.
#
# There is NO process supervisor for this app — confirmed on 2026-08-21:
# no PM2 process, no systemd unit, no cron @reboot entry, and it was never
# registered through Webuzo's Application Manager ("No application exist"
# there). It's a bare `node server.js` someone started by hand at some
# point; Apache proxies to it via a hand-written .htaccess (see
# server-htaccess.reference in the repo root — that file is NOT synced,
# it lives only on the server and only routes traffic, it has no idea
# whether the Node process behind it is alive or running current code).
# The restart step below (scripts/restart-app.sh) kills whatever's
# listening on the app's port and starts a fresh `node server.js` — this
# is the only thing that makes a deploy's new code actually take effect.
# Skipping it (or a deploy failing before reaching it) leaves the OLD
# process quietly serving old code indefinitely, even though new files
# are already on disk — this happened for real, for hours, on 2026-08-21.
#
# Permissions: rsync intentionally does NOT preserve source permissions
# here (no -a/-p). This local checkout happens to have owner-only
# (rwx------) permissions, a quirk of the environment it was created in —
# preserved onto the server as root, that once produced root-owned,
# mode-700 files Apache couldn't read (a real 403 outage on 2026-08-21). An
# explicit `chmod -R go+rX` after syncing fixes readability regardless of
# what the source's permissions look like or who ends up owning the files
# (macOS's stock rsync is the ancient 2.6.9 and doesn't support --chown at
# all). .env and backups/ are deliberately re-narrowed back to private
# immediately after, since a blanket go+rX would otherwise expose DB
# credentials and real participant data to every other account on this
# shared server.
#
# One-time setup:
#   cp deploy.config.sh.example deploy.config.sh
#   # edit deploy.config.sh with your real DEPLOY_HOST / DEPLOY_PATH
#
# Usage:
#   ./deploy.sh                 build, sync, install, backup+migrate, restart
#   ./deploy.sh --no-migrate    skip the DB migration step entirely
#   ./deploy.sh --no-backup     migrate but skip the pre-migration mysqldump
set -euo pipefail
cd "$(dirname "$0")"

if [ -f deploy.config.sh ]; then
  # shellcheck source=deploy.config.sh
  source deploy.config.sh
else
  echo "!! deploy.config.sh not found. Copy deploy.config.sh.example -> deploy.config.sh and fill it in." >&2
  exit 1
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST in deploy.config.sh}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH in deploy.config.sh}"

# SSH_KEY (optional, set in deploy.config.sh) points at a dedicated deploy
# key instead of relying on ssh-agent/default identity resolution.
SSH_KEY="${SSH_KEY:-}"
if [ -n "$SSH_KEY" ]; then
  SSH_CMD=(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes)
  RSYNC_SSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes"
else
  SSH_CMD=(ssh)
  RSYNC_SSH="ssh"
fi

RUN_MIGRATE=1
RUN_BACKUP=1
for arg in "$@"; do
  case "$arg" in
    --no-migrate) RUN_MIGRATE=0 ;;
    --no-backup) RUN_BACKUP=0 ;;
    *) echo "!! Unknown option: $arg" >&2; exit 1 ;;
  esac
done

echo "==> Building frontend locally"
npm ci
npm run build

echo "==> Preparing remote directories"
"${SSH_CMD[@]}" "$DEPLOY_HOST" "mkdir -p '$DEPLOY_PATH' '$DEPLOY_PATH/public/img' '$DEPLOY_PATH/backups' '$DEPLOY_PATH/tmp'"

echo "==> Checking the server has a .env file"
if ! "${SSH_CMD[@]}" "$DEPLOY_HOST" "test -f '$DEPLOY_PATH/.env'"; then
  echo "!! No .env found at $DEPLOY_PATH/.env on the server." >&2
  echo "!! Create one there first from .env.example, with real DB_* credentials" >&2
  echo "!! and a fresh ADMIN_PASSCODE — refusing to deploy onto the insecure default." >&2
  exit 1
fi

echo "==> Syncing app files (excludes node_modules, .env, .git, uploaded banner images, server-managed .htaccess, macOS AppleDouble junk)"
rsync -rz --delete -e "$RSYNC_SSH" \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.git' \
  --exclude 'public/img' \
  --exclude 'deploy.config.sh' \
  --exclude 'backups' \
  --exclude 'tmp' \
  --exclude '/.htaccess' \
  --exclude '/index.html' \
  --exclude '._*' \
  ./ "$DEPLOY_HOST:$DEPLOY_PATH/"

echo "==> Syncing banner images (adds new ones only — never deletes existing uploads)"
rsync -rz -e "$RSYNC_SSH" \
  --exclude '._*' \
  public/img/ "$DEPLOY_HOST:$DEPLOY_PATH/public/img/"

echo "==> Installing production dependencies on the server"
"${SSH_CMD[@]}" "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && npm ci --omit=dev"

echo "==> Fixing permissions (world-readable app files; .env and backups stay private)"
"${SSH_CMD[@]}" "$DEPLOY_HOST" "chmod -R go+rX '$DEPLOY_PATH' && chmod go-rwx '$DEPLOY_PATH/.env' && chmod -R go-rwx '$DEPLOY_PATH/backups'"

if [ "$RUN_MIGRATE" = "1" ] && [ "$RUN_BACKUP" = "1" ]; then
  echo "==> Backing up the database before migrating"
  "${SSH_CMD[@]}" "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && node db/backup.js"
fi

if [ "$RUN_MIGRATE" = "1" ]; then
  echo "==> Running database migrations on the server"
  "${SSH_CMD[@]}" "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && node db/migrate.js"
else
  echo "==> Skipping migrations (--no-migrate)"
fi

echo "==> Restarting the app process (no supervisor — see header comment)"
"${SSH_CMD[@]}" "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && bash scripts/restart-app.sh"

echo "==> Done. Verify at https://sulutions.cloud/NMAWebinar/"
