# 2026Midterms (VoteInformed)

VoteInformed helps voters understand every 2026 federal race: who is running, their records, who funds them, what prediction markets say, and what changed. It runs entirely on Railway.

- **Plan, product ideas, and tech stack:** [PLAN.md](PLAN.md)
- **Map data sources and licensing:** [CODE/public/geo/SOURCES.md](CODE/public/geo/SOURCES.md)

| Path | What it is |
|---|---|
| `CODE/` | Public web app (React and Vite) |
| `admin-dashboard/` | Admin web app |
| `backend/` | Express API, sync jobs, and the Prisma database schema |

Run locally with `docker compose up`, which starts Postgres, the API, the web app, and the admin app.
