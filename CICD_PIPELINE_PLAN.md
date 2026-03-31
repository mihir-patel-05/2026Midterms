# CI/CD Pipeline Plan for 2026 Midterms

This document outlines the recommended GitHub Actions CI/CD pipelines for the 2026 Midterms project — a full-stack TypeScript application consisting of:

- **Backend** – Node.js / Express / TypeScript / Prisma / PostgreSQL (`backend/`)
- **Frontend** – React 18 / Vite / TypeScript / shadcn-ui (`CODE/`)
- **Admin Dashboard** – React 18 / Vite / TypeScript (`admin-dashboard/`)
- **Deployment** – Railway (backend), with Docker support for local development

The single workflow that currently exists (`sync-fec-data.yml`) handles scheduled FEC data synchronisation. The pipelines below complement it and cover the full software delivery lifecycle.

---

## Table of Contents

1. [Overview of Proposed Pipelines](#1-overview-of-proposed-pipelines)
2. [Pipeline Details](#2-pipeline-details)
   - [2.1 Continuous Integration – Pull Request Checks](#21-continuous-integration--pull-request-checks)
   - [2.2 Backend Build & Type-Check](#22-backend-build--type-check)
   - [2.3 Frontend Lint & Build](#23-frontend-lint--build)
   - [2.4 Admin Dashboard Build](#24-admin-dashboard-build)
   - [2.5 Docker Image Build & Smoke Test](#25-docker-image-build--smoke-test)
   - [2.6 Continuous Deployment – Backend to Railway](#26-continuous-deployment--backend-to-railway)
   - [2.7 Continuous Deployment – Frontend](#27-continuous-deployment--frontend)
   - [2.8 Database Migrations](#28-database-migrations)
   - [2.9 Dependency Security Audit](#29-dependency-security-audit)
   - [2.10 CodeQL Static Analysis (SAST)](#210-codeql-static-analysis-sast)
   - [2.11 FEC Data Sync (existing, enhanced)](#211-fec-data-sync-existing-enhanced)
   - [2.12 Stale Branch / Issue Cleanup](#212-stale-branch--issue-cleanup)
3. [Required GitHub Secrets & Variables](#3-required-github-secrets--variables)
4. [Branch & Environment Strategy](#4-branch--environment-strategy)
5. [Suggested Implementation Order](#5-suggested-implementation-order)

---

## 1. Overview of Proposed Pipelines

| # | Workflow file | Trigger | Purpose |
|---|--------------|---------|---------|
| 1 | `ci.yml` | Pull request to `main` / `develop` | Full CI gate (type-check, lint, build for all apps) |
| 2 | `backend-deploy.yml` | Push to `main` | Deploy backend to Railway |
| 3 | `frontend-deploy.yml` | Push to `main` | Deploy frontend to a static host (Vercel / Netlify / GitHub Pages) |
| 4 | `admin-deploy.yml` | Push to `main` | Deploy admin dashboard to its static host |
| 5 | `docker-build.yml` | Push to `main` / tag push | Build & push Docker image to a container registry |
| 6 | `db-migrate.yml` | Push to `main` (path filter: `backend/prisma/**`) | Run Prisma migrations against production DB |
| 7 | `security-audit.yml` | Weekly schedule + push to `main` | `npm audit` dependency vulnerability scan |
| 8 | `codeql-analysis.yml` | Push to `main`, weekly schedule | GitHub CodeQL SAST scanning |
| 9 | `sync-fec-data.yml` | Mon/Wed/Fri 02:00 UTC + manual | FEC data sync (already exists; improvements suggested) |
| 10 | `stale.yml` | Daily schedule | Auto-label / close stale issues and PRs |

---

## 2. Pipeline Details

---

### 2.1 Continuous Integration – Pull Request Checks

**File:** `.github/workflows/ci.yml`

**Purpose:** Acts as the single required status check before any code is merged. Runs type-checking, linting, and production builds for every changed app. A failing CI run blocks the merge.

**Triggers:**
```yaml
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]
```

**Jobs:**

| Job | Steps | Path filter |
|-----|-------|-------------|
| `backend-ci` | `npm ci` → `npx prisma generate` → `tsc --noEmit` → `npm run build` | `backend/**` |
| `frontend-ci` | `npm ci` → `npm run lint` → `npm run build` | `CODE/**` |
| `admin-ci` | `npm ci` → `npm run build` | `admin-dashboard/**` |

**Key design decisions:**
- Each job is **path-filtered** so only the changed sub-project runs on a given PR (speeds up feedback).
- Uses `npm ci` (not `npm install`) for reproducible, lock-file-pinned installs.
- All three jobs run in parallel; there is no `needs:` dependency between them.
- Prisma client generation is required before the TypeScript compiler can resolve `@prisma/client` types.

**Example job (backend):**
```yaml
jobs:
  backend-ci:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit          # type-check only (fast)
      - run: npm run build             # full compile to dist/
```

---

### 2.2 Backend Build & Type-Check

Covered as the `backend-ci` job in `ci.yml` (see above). May be broken out into its own workflow (`backend-ci.yml`) if the team prefers separate status checks per app in the GitHub branch protection settings.

**Why TypeScript `--noEmit`?**
Running `tsc --noEmit` separately from `npm run build` gives fast, early type-error feedback without waiting for the full Prisma + tsc compile cycle. Both checks are retained — `--noEmit` as a quick gate, `build` as a packaging verification.

---

### 2.3 Frontend Lint & Build

Covered as the `frontend-ci` job in `ci.yml`.

**ESLint configuration already exists** in `CODE/eslint.config.js`. The existing `npm run lint` script is sufficient. No changes to the app code are required — just calling the script in CI.

**Optional enhancement:** add `--max-warnings 0` to the lint command to treat warnings as errors in CI:
```yaml
- run: npm run lint -- --max-warnings 0
```

---

### 2.4 Admin Dashboard Build

Covered as the `admin-ci` job in `ci.yml`.

The admin dashboard has no explicit lint script; the `build` step (which includes `tsc`) acts as the type-check. A TypeScript strict config or an ESLint setup could be added later.

---

### 2.5 Docker Image Build & Smoke Test

**File:** `.github/workflows/docker-build.yml`

**Purpose:** Validates that the backend `Dockerfile` still produces a working image after every merge to `main`. Optionally pushes to a container registry (GitHub Container Registry / Docker Hub) for use by Railway or other deployment targets.

**Trigger:**
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'docker-compose.yml'
  tags:
    - 'v*.*.*'
```

**Jobs:**

1. **`build`** – Build the Docker image using the multi-stage `backend/Dockerfile`.
2. **`smoke-test`** – Start the container with `docker-compose up -d`, wait for the health check endpoint (`/api/health`) to return HTTP 200, then tear down.
3. **`push`** (conditional on tag push or `main` merge) – Log in to GHCR and push the image with the appropriate tags (`latest`, `sha-<short>`, `v1.2.3`).

**Example steps:**
```yaml
- name: Build Docker image
  uses: docker/build-push-action@v5
  with:
    context: ./backend
    tags: ghcr.io/${{ github.repository }}/backend:${{ github.sha }}
    load: true          # keep image locally for smoke test
    push: false

- name: Smoke test health endpoint
  run: |
    docker run -d --name backend-test \
      -e DATABASE_URL="postgresql://..." \
      -e FEC_API_KEY="dummy" \
      -e GEMINI_API_KEY="dummy" \
      -p 3001:3001 \
      ghcr.io/${{ github.repository }}/backend:${{ github.sha }}
    sleep 5
    curl --fail http://localhost:3001/api/health
    docker stop backend-test
```

---

### 2.6 Continuous Deployment – Backend to Railway

**File:** `.github/workflows/backend-deploy.yml`

**Purpose:** Automatically redeploy the backend to Railway whenever code is merged to `main`. Railway supports webhook-triggered deployments and also has a GitHub Actions integration via the `railway` CLI.

**Trigger:**
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
```

**Strategy options (pick one):**

| Option | How it works | Complexity |
|--------|-------------|-----------|
| **Railway GitHub integration (recommended)** | Connect Railway project to this GitHub repo; Railway auto-deploys on `main` push — no extra workflow needed | Low |
| **Railway CLI in Actions** | Install `railway` CLI, run `railway up` with a service token | Medium |
| **Docker → Railway** | Push image to GHCR; Railway service pulls it | Medium |

If using the Railway CLI approach:
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: railwayapp/railway-github-action@v1
    with:
      railway-token: ${{ secrets.RAILWAY_TOKEN }}
      service: backend
```

**Pre-requisites:** `RAILWAY_TOKEN` secret must be configured.

---

### 2.7 Continuous Deployment – Frontend

**File:** `.github/workflows/frontend-deploy.yml`

**Purpose:** Build and deploy the React frontend to a static hosting provider every time `main` is updated.

**Recommended hosting options:**

| Platform | Deployment mechanism | Notes |
|---------|---------------------|-------|
| **Vercel** | `vercel` CLI or Vercel GitHub App | Zero-config for Vite; sets `VITE_API_URL` automatically |
| **Netlify** | `netlify` CLI or Netlify GitHub App | Good for SPA routing (add `_redirects`) |
| **GitHub Pages** | `actions/deploy-pages` | Free; requires `base` path config in Vite if not at root |
| **Cloudflare Pages** | CF Pages GitHub integration | Fast CDN, free tier |

**Example (Vercel):**
```yaml
on:
  push:
    branches: [main]
    paths: ['CODE/**']

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: CODE
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: CODE/package-lock.json
      - run: npm ci
      - run: npm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: CODE
```

An identical pattern applies to the admin dashboard — just use its own Vercel project IDs / Netlify site ID.

---

### 2.8 Database Migrations

**File:** `.github/workflows/db-migrate.yml`

**Purpose:** Run `prisma migrate deploy` against the production database whenever the Prisma schema or migration files change on `main`. This is safer than having migrations run inside the Railway startup command for large production databases.

**Trigger:**
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'backend/prisma/**'
```

**Important safety considerations:**
- This workflow runs **after** the backend deployment workflow (`needs: deploy`) so the new code and the new schema are in sync.
- Use a **dedicated migration database user** with limited permissions (no `DROP TABLE`, etc.).
- Optionally add a **manual approval gate** (`environment: production`) before migrations run in production.

**Example:**
```yaml
jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: production           # requires manual approval in GitHub UI
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
```

---

### 2.9 Dependency Security Audit

**File:** `.github/workflows/security-audit.yml`

**Purpose:** Run `npm audit` against all three `package.json` files to catch known CVEs in dependencies. Fails the workflow if **high** or **critical** vulnerabilities are found.

**Trigger:**
```yaml
on:
  schedule:
    - cron: '0 9 * * 1'     # every Monday at 09:00 UTC
  push:
    branches: [main]
    paths:
      - '**/package-lock.json'
      - '**/package.json'
```

**Jobs:**
```yaml
strategy:
  matrix:
    workspace: [backend, CODE, admin-dashboard]
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: '20'
  - run: npm audit --audit-level=high
    working-directory: ${{ matrix.workspace }}
```

**Optional enhancement:** Use `npm audit --json` and upload results as a workflow artifact, or integrate with GitHub's Dependabot alerts (enable in repository settings → Security → Dependabot).

---

### 2.10 CodeQL Static Analysis (SAST)

**File:** `.github/workflows/codeql-analysis.yml`

**Purpose:** GitHub's built-in static analysis engine scans the TypeScript/JavaScript codebase for security vulnerabilities (injection flaws, prototype pollution, path traversal, etc.).

**Trigger:**
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '30 1 * * 0'    # every Sunday at 01:30 UTC
```

**Configuration:**
```yaml
jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      actions: read
      contents: read
    strategy:
      matrix:
        language: [javascript-typescript]
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
```

Results appear in the **Security → Code scanning alerts** tab. This is fully free for public repositories.

---

### 2.11 FEC Data Sync (existing, enhanced)

**File:** `.github/workflows/sync-fec-data.yml` *(already exists)*

**Current state:** Triggers a POST to `/api/sync/all` on a Mon/Wed/Fri schedule and on manual dispatch.

**Suggested enhancements:**

1. **Slack / email notification on failure** – Add a `failure()` step that posts to a Slack webhook or sends an email via SendGrid so the team is immediately alerted when a sync fails.

2. **Retry logic** – Wrap the `curl` call in a retry loop (max 3 attempts with exponential back-off) to handle transient network errors.

3. **Structured job summary** – Parse the JSON response body and write a GitHub Job Summary (`$GITHUB_STEP_SUMMARY`) showing how many candidates were synced, the duration, etc.

4. **Conditional sync** – Add a `workflow_dispatch` input (`force: boolean`) so an operator can trigger a full force-resync without editing the file.

**Example additions:**
```yaml
# At end of sync step
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1.26.0
  with:
    payload: '{"text": "❌ FEC data sync failed! Check the run at ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"}'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

### 2.12 Stale Branch / Issue Cleanup

**File:** `.github/workflows/stale.yml`

**Purpose:** Automatically label issues and pull requests that have had no activity in 30 days as "stale", and close them after a further 7 days of inactivity. Keeps the backlog clean.

**Trigger:**
```yaml
on:
  schedule:
    - cron: '0 8 * * *'    # daily at 08:00 UTC
```

**Example:**
```yaml
jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v9
        with:
          stale-issue-message: 'This issue has been inactive for 30 days and is now marked stale. It will be closed in 7 days if there is no further activity.'
          stale-pr-message: 'This pull request has been inactive for 30 days and is now marked stale. It will be closed in 7 days if there is no further activity.'
          days-before-stale: 30
          days-before-close: 7
          exempt-issue-labels: 'pinned,security'
          exempt-pr-labels: 'pinned,do-not-close'
```

---

## 3. Required GitHub Secrets & Variables

Configure these in **Settings → Secrets and variables → Actions**.

### Secrets (sensitive)

| Secret name | Used by | Description |
|-------------|---------|-------------|
| `SYNC_API_KEY` | `sync-fec-data.yml` | Bearer key for `/api/sync/all` endpoint |
| `API_URL` | `sync-fec-data.yml` | Base URL of the deployed backend (e.g. `https://your-app.railway.app`) |
| `RAILWAY_TOKEN` | `backend-deploy.yml` | Railway service token for CLI deployments |
| `PRODUCTION_DATABASE_URL` | `db-migrate.yml` | Full PostgreSQL connection string for prod DB |
| `VITE_API_URL` | `frontend-deploy.yml` | Production backend URL injected at build time |
| `VERCEL_TOKEN` | `frontend-deploy.yml`, `admin-deploy.yml` | Vercel personal access token |
| `VERCEL_ORG_ID` | `frontend-deploy.yml` | Vercel organisation ID |
| `VERCEL_PROJECT_ID_FRONTEND` | `frontend-deploy.yml` | Vercel project ID for `CODE/` app |
| `VERCEL_PROJECT_ID_ADMIN` | `admin-deploy.yml` | Vercel project ID for `admin-dashboard/` app |
| `SLACK_WEBHOOK_URL` | `sync-fec-data.yml` (enhanced) | Slack incoming webhook for failure alerts |

### Variables (non-sensitive)

| Variable name | Used by | Description |
|---------------|---------|-------------|
| `NODE_VERSION` | All workflows | Pin Node.js version (`20`) |
| `DOCKER_REGISTRY` | `docker-build.yml` | Registry host (e.g. `ghcr.io`) |

---

## 4. Branch & Environment Strategy

### Recommended branching model

```
main          ← production deployments, protected branch
  └─ develop  ← integration branch; staging deployments
       └─ feature/* / fix/* / chore/*  ← short-lived work branches
```

### GitHub Environments

Create two **Environments** in **Settings → Environments**:

| Environment | Mapped branch | Protection rules |
|-------------|--------------|-----------------|
| `staging` | `develop` | No manual approval; auto-deploy on push |
| `production` | `main` | Require at least 1 reviewer approval before deploy + DB migration |

The `db-migrate.yml` workflow references `environment: production` to enforce the manual approval gate before running irreversible migrations.

### Branch protection rules for `main`

- ✅ Require status checks to pass: `backend-ci`, `frontend-ci`, `admin-ci`
- ✅ Require pull request reviews: at least 1 approver
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require branches to be up to date before merging
- ✅ Do not allow force pushes

---

## 5. Suggested Implementation Order

Implement the pipelines in this order to get the most value quickly while avoiding unnecessary complexity:

| Priority | Pipeline | Why first |
|---------|----------|-----------|
| **1 – High** | `ci.yml` (PR checks) | Prevents broken code from merging; safest starting point |
| **2 – High** | `codeql-analysis.yml` | Free SAST; catches security issues early |
| **3 – High** | `security-audit.yml` | Fast to add; catches CVE-ridden dependencies |
| **4 – Medium** | `sync-fec-data.yml` enhancements | Improves reliability of existing workflow |
| **5 – Medium** | `backend-deploy.yml` | Automates the most critical deployment |
| **6 – Medium** | `frontend-deploy.yml` + `admin-deploy.yml` | Automates static site deployments |
| **7 – Lower** | `docker-build.yml` | Validates Docker reproducibility; useful if moving away from Railway Nixpacks |
| **8 – Lower** | `db-migrate.yml` | Add once team is comfortable with the deployment pipeline |
| **9 – Low** | `stale.yml` | Nice-to-have housekeeping |

---

*Last updated: March 2026*
