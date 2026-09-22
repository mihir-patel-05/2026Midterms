# Railway Day 0 Service and Environment Plan

This document describes the proposed beta topology. It does not provision resources, insert secrets, or claim that a results provider is configured.

## Service topology

| Service | Root | Build | Start / pre-deploy | Public | Day 0 state |
|---|---|---|---|---:|---|
| `web` | `CODE` | `npm ci && npm run build` | Serve `dist/` with the existing Nginx image | Yes | Existing Docker build; dashboard flag defaults off |
| `api` | `backend` | `npm ci && npm run build` | Pre-deploy: `npm run prisma:deploy`; start: `npm start` | Yes | Existing API; liveness and readiness are separate |
| `ingestion-worker` | `backend` | Same image as API | Future `npm run worker:ingestion` | No | Interface/schema only; do not create service until a queue consumer exists |
| `results-poller` | `backend` | Same image as API | Future `npm run worker:results-poller` | No | Blocked on an approved provider; must be always-on during configured windows |
| `cron-fec` | `backend` | Same image as API | `npm run sync:all`, then exit | No | Existing command; validate against staging before scheduling |
| PostgreSQL | Railway database | Managed | Managed | No | Required system of record |
| Redis | Railway database | Managed | Managed | No | Justified for queues, distributed locks, cache invalidation, and bounded retries; defer provisioning until worker implementation |
| Object storage | Railway Bucket | Managed | S3-compatible private access | No | Justified for immutable raw artifacts and versioned geography; defer SDK/configuration until ingestion is implemented |

Railway services should use separate root directories or watch paths so frontend-only changes do not redeploy the API. Only the API runs database migrations, using a pre-deploy command so a failed migration prevents the new deployment from starting. Scheduled jobs must terminate cleanly. Election-night polling belongs in an always-on worker rather than a cron process.

## Health checks

- Liveness: `GET /api/health/live` returns `200` when the process can serve HTTP. It does not query external providers or PostgreSQL.
- Readiness: `GET /api/health/ready` returns `200` only when PostgreSQL is reachable, otherwise `503`.
- Compatibility: `GET /api/health` retains the existing database-aware behavior.
- Provider health is reported separately from service readiness. An unavailable upstream must not make the read API unready while the last valid snapshot can still be served.

Set the Railway API health-check path to `/api/health/ready`. Worker health should eventually report queue connectivity and heartbeat/lag without calling an upstream provider in the probe.

## Environment variable contract

Values below are names and responsibilities only. Do not commit real values.

### Shared backend

| Name | Required | Purpose |
|---|---:|---|
| `NODE_ENV` | Yes | `development`, `test`, or `production` |
| `DATABASE_URL` | Yes | Private PostgreSQL connection string |
| `PORT` | Railway supplied | HTTP port for API |
| `FRONTEND_URL` | Production | Allowed public web origin |
| `ADMIN_URL` | Production | Allowed admin origin |
| `FEATURE_ELECTION_DASHBOARD` | Yes | Master server-side dashboard flag; default `false` |
| `RESULTS_PROVIDER_MOCK_ENABLED` | Yes | Enables only the labeled mock fixture path; default `false` |
| `RESULTS_PROVIDER_ENABLED_IDS` | No | Comma-separated approved adapter IDs; empty means no live provider |
| `RESULTS_STALE_AFTER_SECONDS` | Yes | Global fallback stale threshold; provider metadata may be stricter |
| `RESULTS_POLL_INTERVAL_SECONDS` | Poller | Poll cadence after provider approval |
| `RESULTS_PARSER_VERSION` | Worker | Deployed parser/build identifier |

### Existing integrations and credentials

| Name | Scope | Notes |
|---|---|---|
| `FEC_API_KEY` | FEC jobs/API | Existing OpenFEC credential; server-side only |
| `FEC_API_BASE_URL` | FEC jobs/API | Existing endpoint override |
| `GEMINI_API_KEY` | Existing chat feature | Unrelated to result ingestion |
| `SYNC_API_KEY` | Existing sync endpoint | Long random server-side secret |
| `RESEARCHER_JWT_SECRET` | Research auth | Long random server-side secret |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` | Admin provisioning | Provisioning only; do not bake into images |

### Queue and cache (when provisioned)

| Name | Required then | Purpose |
|---|---:|---|
| `REDIS_URL` | Yes | Private Redis connection string shared by API and workers |
| `RESULTS_QUEUE_NAME` | Yes | Queue namespace |
| `RESULTS_WORKER_CONCURRENCY` | Yes | Bounded worker concurrency |
| `RESULTS_JOB_ATTEMPTS` | Yes | Bounded retries before dead-letter handling |

### Object storage (when provisioned)

| Name | Required then | Purpose |
|---|---:|---|
| `S3_ENDPOINT` | Yes | Railway Bucket endpoint |
| `S3_REGION` | Yes | S3-compatible region |
| `S3_BUCKET` | Yes | Private bucket name |
| `S3_ACCESS_KEY_ID` | Yes | Server-side access key |
| `S3_SECRET_ACCESS_KEY` | Yes | Server-side secret key |
| `RAW_ARTIFACT_PREFIX` | Yes | Content-addressed raw artifact namespace |

### Frontend build-time values

| Name | Required | Purpose |
|---|---:|---|
| `VITE_API_URL` | Yes | Public API base URL |
| `VITE_FEATURE_ELECTION_DASHBOARD` | Yes | Builds/exposes the dashboard route when `true` |
| `VITE_RESULTS_PROVIDER_MOCK_ENABLED` | Yes | Allows labeled mock fixtures when `true`; default `false` |

No provider-specific variable should be added until an adapter ID and credential contract are approved. Use `RESULTS_PROVIDER_<APPROVED_ID>_ENABLED` plus provider-documented credential names at that time.

## Deployment commands

From the repository root, the reproducible local/CI commands are:

```bash
cd backend
npm ci
npm run prisma:generate
npm run typecheck
npm test
npm run build

cd ../CODE
npm ci
npm run lint -- --max-warnings 0
npm run typecheck
npm run build

cd ../admin-dashboard
npm ci
npm run build
```

Railway API settings:

```text
Root directory: backend
Build command: npm ci && npm run build
Pre-deploy command: npm run prisma:deploy
Start command: npm start
Health check: /api/health/ready
```

Railway web settings:

```text
Root directory: CODE
Build command: npm ci && npm run build
Start command: use the existing Dockerfile/Nginx CMD
```

Do not use `start:railway` together with a pre-deploy migration command; that would run migrations twice. Do not start the future poller or worker with `npm start`.

## Day 0 CI and operations gaps

- Results tests and Prisma validation must run in pull requests, not only builds.
- The existing Docker smoke test accepts readiness `503` with a dummy database; it should use liveness for process verification and test readiness separately when PostgreSQL is present.
- The current API starts an in-process scheduler. Before horizontal scaling, scheduled work must move to exiting cron commands or a dedicated worker to avoid duplicate schedules.
- Redis and object storage are justified but intentionally not provisioned or imported on Day 0.
- No production deployment, migration, secret creation, or external resource creation is part of this change.

## Railway references

- [Railway monorepo deployments](https://docs.railway.com/deployments/monorepo)
- [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway cron jobs, workers, and queues](https://docs.railway.com/guides/cron-workers-queues)
- [Railway storage buckets](https://docs.railway.com/storage-buckets)
