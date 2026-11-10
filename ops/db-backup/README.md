# Database backup job (issue #190)

A Railway cron service that takes a logical backup of the main database (`Testing_database` today; the one
`Backend`'s `DATABASE_URL` points at) and keeps it only if a restore of it checks out.

Each run (`backup.sh`):

1. Opens a read-only transaction on the source, exports its snapshot, and counts every table's rows in it.
2. Runs `pg_dump` on that same snapshot, so the counts describe exactly what the dump holds even while the
   results ingestor and the Kalshi snapshots keep writing.
3. Restores the dump into a throwaway Postgres inside the container and counts every table again.
4. Uploads `main.dump`, `source-counts.tsv` and `manifest.json` (size, SHA-256, row totals) to
   `db-backups/main/<UTC time>/` in the bucket, only if every count matched. Any failure exits non-zero and
   uploads nothing.

The log ends with the row counts of the election-night tables (`result_snapshots`, `race_calls`,
`candidate_votes`, `market_snapshots`), including how many fall between 6 PM ET on Nov 3 and 6 AM ET on Nov 4.

## Railway service

| Setting | Value |
|---|---|
| Source | this repo, root directory `/ops/db-backup` (built from its `Dockerfile`) |
| Cron | `30 8 * * *` (3:30 AM ET), restart policy `NEVER` |
| `DATABASE_URL` | `${{Testing_database.DATABASE_URL}}` (a reference, never pasted) |
| `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, `REGION` | references to the bucket's variables |

The image is `postgres:18`, because `pg_dump` must be at least the server's major version (Railway's
`postgres-ssl:18`).

## Restoring

```bash
pg_restore --no-owner --no-privileges --dbname "$TARGET_DATABASE_URL" main.dump
```

Then compare the target's row counts with `source-counts.tsv`.

## Testing locally

`BACKUP_SKIP_UPLOAD=true` skips the upload, and `BACKUP_KEEP_DIR=<dir>` keeps the dump, counts and manifest.
`BACKUP_S3_ADDRESSING=path` is for S3 emulators that don't support virtual-hosted URLs.
