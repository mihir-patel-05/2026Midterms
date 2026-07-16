# Migration bootstrap

This repository now has a Prisma migration history. The first migration is a
baseline of the schema that already exists in production; the second contains
the Day 1 changes.

## Existing production database

Back up the database, then run these commands once before enabling automatic
migration deploys:

```bash
npx prisma migrate resolve --applied 20260716000000_baseline
npx prisma migrate deploy
```

Do not mark `20260716010000_day1_critical_fixes` as applied. It must execute to
create durable sessions and sync leases, add source IDs, clean exact legacy
finance duplicates, and convert calendar columns to PostgreSQL `DATE`.

## New local or test database

Run `npx prisma migrate deploy`. Both the baseline and Day 1 migration will be
applied in order.
