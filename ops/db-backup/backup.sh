#!/usr/bin/env bash
# Logical backup of the main database, proven by a restore before it is kept (PLAN.md 5.5, issue #190).
#
#  1. Opens a read-only transaction on the source and exports its snapshot.
#  2. Counts every table's rows inside that transaction, then runs pg_dump on the same snapshot,
#     so the counts describe exactly what the dump holds, even while the results ingestor writes.
#  3. Restores the dump into a throwaway Postgres inside this container and counts again.
#  4. Uploads the dump, the counts and a manifest to the bucket only if every table matches.
#
# Exits non-zero on any failure; nothing is uploaded unless the restore check passed.
#
# Required:  DATABASE_URL
# Upload:    BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, REGION (Railway bucket variables)
# Optional:  BACKUP_PREFIX (default "db-backups/main"), BACKUP_SKIP_UPLOAD=true (local test runs)
set -Eeuo pipefail

log() { printf '[db-backup] %s\n' "$*"; }
fail() { log "FAILED: $*"; exit 1; }
trap 'fail "line $LINENO: $BASH_COMMAND"' ERR

: "${DATABASE_URL:?DATABASE_URL is required}"
PREFIX="${BACKUP_PREFIX:-db-backups/main}"
SKIP_UPLOAD="${BACKUP_SKIP_UPLOAD:-false}"
if [[ "$SKIP_UPLOAD" != "true" ]]; then
  for name in BUCKET ACCESS_KEY_ID SECRET_ACCESS_KEY ENDPOINT; do
    [[ -n "${!name:-}" ]] || fail "$name is not set (set BACKUP_SKIP_UPLOAD=true for a local test run)"
  done
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d /tmp/db-backup.XXXXXX)"
SCRATCH="$WORK/scratch"
DUMP="$WORK/main.dump"
SRC_COUNTS="$WORK/source-counts.tsv"
RESTORED_COUNTS="$WORK/restored-counts.tsv"
trap 'rm -rf "$WORK"' EXIT

# Host and database only, never the password.
SOURCE_DESC="$(psql "$DATABASE_URL" -XAtq -c "select coalesce(inet_server_addr()::text, 'socket') || ' / ' || current_database() || ' / ' || version()")"
log "source: $SOURCE_DESC"

COUNT_SQL="select table_name || E'\t' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;"

# Election-night tables: what the backup must hold (times in UTC; Nov 3 6 PM ET to Nov 4 6 AM ET).
SUMMARY_SQL="select 'result_snapshots' || E'\t' || count(*) || E'\t' || count(*) filter (where received_at between '2026-11-03 23:00Z' and '2026-11-04 11:00Z') || E'\t' || coalesce(min(received_at)::text, '-') || E'\t' || coalesce(max(received_at)::text, '-') from result_snapshots
union all select 'race_calls' || E'\t' || count(*) || E'\t' || count(*) filter (where first_seen_at between '2026-11-03 23:00Z' and '2026-11-04 11:00Z') || E'\t' || coalesce(min(first_seen_at)::text, '-') || E'\t' || coalesce(max(first_seen_at)::text, '-') from race_calls
union all select 'candidate_votes' || E'\t' || count(*) || E'\t' || count(*) filter (where created_at between '2026-11-03 23:00Z' and '2026-11-04 11:00Z') || E'\t' || coalesce(min(created_at)::text, '-') || E'\t' || coalesce(max(created_at)::text, '-') from candidate_votes
union all select 'market_snapshots' || E'\t' || count(*) || E'\t' || count(*) filter (where captured_hour between '2026-11-03 23:00Z' and '2026-11-04 11:00Z') || E'\t' || coalesce(min(captured_hour)::text, '-') || E'\t' || coalesce(max(captured_hour)::text, '-') from market_snapshots;"

# --- 1 and 2: snapshot, counts and dump -------------------------------------------------------
coproc SRC { psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 2>&1; }
send() { printf '%s\n' "$1" >&"${SRC[1]}"; }
# Reads the session's output up to the next marker line.
read_until_marker() {
  local line
  while IFS= read -r -t 600 line <&"${SRC[0]}"; do
    [[ "$line" == "__END__" ]] && return 0
    printf '%s\n' "$line"
  done
  return 1
}
send "begin isolation level repeatable read read only;"
send "select pg_export_snapshot();"
send "select '__END__';"
# Read into files: bash does not hand a coprocess's pipes to a $( ) subshell.
read_until_marker > "$WORK/snapshot.txt" || fail "no answer when exporting the snapshot"
SNAPSHOT="$(tail -n 1 "$WORK/snapshot.txt")"
[[ "$SNAPSHOT" =~ ^[0-9A-F-]+$ ]] || fail "could not export a snapshot (got: $SNAPSHOT)"
log "snapshot $SNAPSHOT exported at $(date -u +%FT%TZ)"

send "$COUNT_SQL"; send "select '__END__';"
read_until_marker > "$SRC_COUNTS" || fail "row counts did not finish"
grep -q $'\t' "$SRC_COUNTS" || fail "row counts returned nothing: $(head -c 300 "$SRC_COUNTS")"
log "counted $(wc -l < "$SRC_COUNTS") tables"

send "$SUMMARY_SQL"; send "select '__END__';"
read_until_marker > "$WORK/summary.tsv" || fail "election-night summary did not finish"

log "pg_dump starting"
pg_dump "$DATABASE_URL" --snapshot="$SNAPSHOT" --format=custom --compress=6 --no-owner --no-privileges --file="$DUMP"
send "commit;"; send "\\q"; wait "$SRC_PID" 2>/dev/null || true
DUMP_BYTES="$(stat -c %s "$DUMP")"
DUMP_SHA="$(sha256sum "$DUMP" | cut -d' ' -f1)"
log "dump written: $DUMP_BYTES bytes, sha256 $DUMP_SHA"

# --- 3: restore into a throwaway Postgres and count again ---------------------------------------
mkdir -p "$SCRATCH"
RUN_AS=()
if [[ "$(id -u)" == "0" ]]; then chown -R postgres:postgres "$WORK"; RUN_AS=(runuser -u postgres --); fi
"${RUN_AS[@]}" initdb -D "$SCRATCH/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$SCRATCH/data" -o "-c listen_addresses='' -k $SCRATCH -c fsync=off" -w -l "$SCRATCH/pg.log" start >/dev/null
stop_scratch() { "${RUN_AS[@]}" pg_ctl -D "$SCRATCH/data" -m fast -w stop >/dev/null 2>&1 || true; }
trap 'stop_scratch; rm -rf "$WORK"' EXIT
LOCAL=(-h "$SCRATCH" -U postgres)
createdb "${LOCAL[@]}" restore_check
pg_restore "${LOCAL[@]}" -d restore_check --no-owner --no-privileges --exit-on-error "$DUMP"
psql "${LOCAL[@]}" -d restore_check -XAtq -v ON_ERROR_STOP=1 -c "$COUNT_SQL" > "$RESTORED_COUNTS"

if ! diff -u "$SRC_COUNTS" "$RESTORED_COUNTS" > "$WORK/counts.diff"; then
  cat "$WORK/counts.diff"
  fail "restored row counts differ from the source; nothing uploaded"
fi
TOTAL_ROWS="$(awk -F'\t' '{s += $2} END {print s + 0}' "$SRC_COUNTS")"
log "restore check passed: $(wc -l < "$SRC_COUNTS") tables, $TOTAL_ROWS rows, every count matches"
log "election-night tables (table, rows, rows Nov 3 6PM-Nov 4 6AM ET, first, last):"
sed 's/^/[db-backup]   /' "$WORK/summary.tsv"
log "per-table counts:"
sed 's/^/[db-backup]   /' "$SRC_COUNTS"

# --- 4: upload ---------------------------------------------------------------------------------
cat > "$WORK/manifest.json" <<JSON
{
  "created_at": "$STAMP",
  "snapshot": "$SNAPSHOT",
  "source": "$(printf '%s' "$SOURCE_DESC" | sed 's/"/\\"/g')",
  "pg_dump": "$(pg_dump --version)",
  "format": "custom (pg_restore --no-owner --no-privileges -d <db> main.dump)",
  "dump_bytes": $DUMP_BYTES,
  "dump_sha256": "$DUMP_SHA",
  "tables": $(wc -l < "$SRC_COUNTS"),
  "rows": $TOTAL_ROWS,
  "restore_check": "passed"
}
JSON

if [[ "$SKIP_UPLOAD" == "true" ]]; then
  log "BACKUP_SKIP_UPLOAD=true: not uploading"
  if [[ -n "${BACKUP_KEEP_DIR:-}" ]]; then cp "$DUMP" "$SRC_COUNTS" "$WORK/manifest.json" "$BACKUP_KEEP_DIR"/; log "kept copies in $BACKUP_KEEP_DIR"; fi
  log "done"; exit 0
fi

export AWS_ACCESS_KEY_ID="$ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="${REGION:-auto}"
aws configure set default.s3.addressing_style "${BACKUP_S3_ADDRESSING:-virtual}"
DEST="s3://$BUCKET/$PREFIX/$STAMP"
for file in "$DUMP" "$SRC_COUNTS" "$WORK/manifest.json"; do
  aws --endpoint-url "$ENDPOINT" s3 cp --only-show-errors "$file" "$DEST/$(basename "$file")"
done
REMOTE_BYTES="$(aws --endpoint-url "$ENDPOINT" s3api head-object --bucket "$BUCKET" --key "$PREFIX/$STAMP/main.dump" --query ContentLength --output text)"
[[ "$REMOTE_BYTES" == "$DUMP_BYTES" ]] || fail "uploaded size $REMOTE_BYTES does not match $DUMP_BYTES"
log "uploaded to $PREFIX/$STAMP/ (main.dump, source-counts.tsv, manifest.json); size checked"
log "done"
