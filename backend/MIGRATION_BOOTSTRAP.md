# Migration bootstrap

This repository now has a Prisma migration history. The first migration is a
baseline of the schema that already exists in production; the second contains
the Day 1 changes.

## Existing production database

Back up the database, then run these commands once before enabling automatic
migration deploys. Run them from the `backend/` directory so Prisma uses this
project's pinned Prisma version and `prisma/schema.prisma` file. Ensure that
`DATABASE_URL` is set to the production database URL in that shell first.

```bash
cd backend
npx prisma migrate resolve --schema prisma/schema.prisma --applied 20260716000000_baseline
npx prisma migrate deploy --schema prisma/schema.prisma
```

Do not mark `20260716010000_day1_critical_fixes` as applied. It must execute to
create durable sessions and sync leases, add source IDs, clean exact legacy
finance duplicates, and convert calendar columns to PostgreSQL `DATE`.

## New local or test database

From `backend/`, run `npx prisma migrate deploy --schema prisma/schema.prisma`.
Both the baseline and Day 1 migration will be applied in order.
