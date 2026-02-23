# Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

### Option A: Run with Docker

**Prerequisites:** Docker and Docker Compose installed.

1. **Create env file** (from repo root):
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edit `backend/.env` and set:
   - `FEC_API_KEY` – get one at https://api.data.gov/signup/
   - `GEMINI_API_KEY` – for chat features

2. **Start the stack:**
   ```bash
   docker compose up --build
   ```
   This starts PostgreSQL and the backend. Migrations run automatically on backend startup.

3. **Use the API** at `http://localhost:3001` (e.g. `curl http://localhost:3001/`).

4. **Stop:** `Ctrl+C` then `docker compose down`. Data is kept in a Docker volume; use `docker compose down -v` to remove it.

### Option B: Local development (no Docker)

### 1. Test FEC API Connection ✅

Your FEC API is already configured and working! Test it:

```bash
cd backend
npm run test:fec
```

**Expected Output**:
```
✅ All FEC API Tests Passed!
Found 1 candidates in Arizona Senate race
```

### 2. Start the Development Server

```bash
npm run dev
```

Server will run at: `http://localhost:3001`

### 3. Test the API

```bash
# Health check
curl http://localhost:3001/api/health

# Get candidates (empty initially)
curl http://localhost:3001/api/candidates
```

### 4. Sync Some Data

**Option A: Quick Test** (1-2 minutes)
```bash
curl -X POST http://localhost:3001/api/sync/candidates \
  -H "Content-Type: application/json" \
  -d '{"state": "AZ", "office": "S", "cycle": 2026, "maxPages": 1}'
```

**Option B: Full Sync** (5-15 minutes)
```bash
npm run sync:all
```

This syncs candidates from 7 battleground states plus their financial data.

### 5. View the Data

**Option A: API**
```bash
curl http://localhost:3001/api/candidates?state=AZ&cycle=2026
```

**Option B: Database GUI**
```bash
npm run prisma:studio
```

Opens at `http://localhost:5555`

## 📊 What Data Gets Synced

### Candidates
- Name, party, office (Senate/House)
- District (for House), state
- Incumbent status
- Election cycles

### Committees
- Campaign committee names
- Committee types
- Linked to candidates

### Financial Data
- Total receipts
- Total disbursements
- Cash on hand
- Debt owed

### Itemized Data
- Individual contributions (receipts)
- Campaign expenditures (disbursements)

## 🎯 Next Steps

### Deploy to Railway

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Initialize Project**
   ```bash
   railway init
   ```

3. **Add Environment Variables**
   ```bash
   railway variables set DATABASE_URL="your_postgres_url"
   railway variables set FEC_API_KEY="MZHQDPqUKjrbJEmqYvwEKgrf8Q0FfGjwAsFamjTe"
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Set Up Cron Job**
   - Go to Railway dashboard
   - Add new "Cron Job" service
   - Schedule: `0 2 * * 1,3,5`
   - Command: `npm run sync:all`

See [RAILWAY_CRON_SETUP.md](./RAILWAY_CRON_SETUP.md) for detailed instructions.

### Connect Your Frontend

Update your React app to fetch from the API:

```typescript
// In your React app
const API_URL = 'http://localhost:3001/api';

async function getCandidates(state: string, cycle: number) {
  const response = await fetch(
    `${API_URL}/candidates?state=${state}&cycle=${cycle}`
  );
  return response.json();
}
```

## 📖 Available Commands

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run build            # Build TypeScript
npm start                # Run production server

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open database GUI

# Data Syncing
npm run test:fec         # Test FEC API connection
npm run sync:all         # Run full data sync

# Utilities
npm run lint             # (if added) Run linter
npm test                 # (if added) Run tests
```

## 🔍 Exploring the Data

### Example Queries

**Get all Arizona candidates**:
```bash
curl "http://localhost:3001/api/candidates?state=AZ"
```

**Get Senate races only**:
```bash
curl "http://localhost:3001/api/candidates?office=S"
```

**Get 2026 candidates**:
```bash
curl "http://localhost:3001/api/candidates?cycle=2026"
```

**Get candidate finances**:
```bash
# First get a candidate ID from the list
curl "http://localhost:3001/api/candidates"

# Then use that ID
curl "http://localhost:3001/api/candidates/{id}/finances"
```

## ⚙️ Configuration

All configuration is in `.env`:

```env
DATABASE_URL=postgresql://...
FEC_API_KEY=your_key_here
PORT=3001
NODE_ENV=development
```

## 🐛 Troubleshooting

**"Cannot connect to database"**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Run `npx prisma db push` to create tables

**"FEC API error 403"**
- Check `FEC_API_KEY` in `.env`
- Get a new key at https://api.data.gov/signup/

**"No candidates found"**
- Run `npm run sync:all` to fetch data
- Or manually sync via API: `POST /api/sync/candidates`

**Rate limit errors**
- FEC API allows 120 requests/hour
- Reduce `maxPages` in sync config
- Wait an hour before trying again

## 📚 Documentation

- [README.md](./README.md) - Complete API documentation
- [RAILWAY_CRON_SETUP.md](./RAILWAY_CRON_SETUP.md) - Cron job setup
- [Prisma Schema](./prisma/schema.prisma) - Database structure

## 💡 Pro Tips

1. **Start Small**: Sync 1-2 states first, then expand
2. **Use Prisma Studio**: Great for exploring database structure
3. **Check Logs**: All API calls and errors are logged to console
4. **Rate Limits**: Be mindful of FEC API limits (120/hour)
5. **Database Backups**: Railway backs up automatically, but export periodically

## ✅ You're Ready!

Your backend is fully configured with:
- ✅ PostgreSQL database with normalized schema
- ✅ FEC API integration with rate limiting
- ✅ RESTful API endpoints
- ✅ Automated cron job system
- ✅ Comprehensive documentation

Start building your frontend and let the cron jobs keep your data fresh!
