# FEC Sync Service - Setup & Testing Guide

## 🚀 Quick Start

### 1. Prerequisites

- Node.js v18+ installed
- PostgreSQL database (local or Railway)
- FEC API key (get from https://api.open.fec.gov/developers/)

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Configure Environment

Create a `.env` file in the `backend/` directory:

```bash
# Copy from ENV_SETUP.md or use these values:
DATABASE_URL="postgresql://username:password@localhost:5432/voteinformed_2026"
FEC_API_KEY="YOUR_FEC_API_KEY_HERE"
FEC_API_BASE_URL="https://api.open.fec.gov/v1"
FEC_API_MAX_REQUESTS_PER_HOUR="120"
PORT="3001"
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"
SYNC_API_KEY="test-sync-key-123"
```

### 4. Run Database Migration

```bash
npx prisma migrate dev
```

This will create all tables including the new `SyncLog` model.

### 5. Generate Prisma Client

```bash
npx prisma generate
```

### 6. Start the Server

```bash
npm run dev
```

You should see:
```
✅ Database connected successfully
⏰ FEC Data Sync Scheduler initialized
📅 Schedule: Every Sunday at 2:00 AM EST
🔄 Next run: [date]

🚀 Server is running on port 3001
```

## ✅ Testing Checklist

### Test 1: Verify Database Migration

```bash
npx prisma studio
```

Navigate to the `sync_logs` table - it should exist and be empty.

### Test 2: Check API Health

```bash
curl http://localhost:3001/api/health
```

### Test 3: Verify Sync Status Endpoint

```bash
curl http://localhost:3001/api/sync/status
```

Expected response:
```json
{
  "summary": {
    "totalSyncs": 0,
    "completedSyncs": 0,
    "failedSyncs": 0,
    "lastSuccessfulSync": null
  },
  "recentSyncs": []
}
```

### Test 4: Manual Sync - Single State (Recommended First Test)

Before running a full sync, test with Arizona only:

**Option A: Edit the scheduler config temporarily**

In `src/jobs/scheduler.ts`, change:
```typescript
states: ['AZ'], // Just Arizona for testing
```

**Option B: Use the manual candidates endpoint**

```bash
curl -X POST http://localhost:3001/api/sync/candidates \
  -H "Content-Type: application/json" \
  -d '{
    "state": "AZ",
    "office": "S",
    "cycle": 2026
  }'
```

### Test 5: Full Sync (After Single State Success)

```bash
curl -X POST http://localhost:3001/api/sync/full \
  -H "x-sync-key: test-sync-key-123"
```

This will:
1. Create a SyncLog entry with status "started"
2. Sync all candidates from configured states
3. Sync financial data and committees
4. Update SyncLog with final results

**Watch the console output** for detailed progress.

### Test 6: Check Sync Results

After the sync completes, verify the data:

```bash
# Check candidates synced
curl http://localhost:3001/api/candidates?state=AZ

# Check sync status
curl http://localhost:3001/api/sync/status
```

Or use Prisma Studio:
```bash
npx prisma studio
```

Check these tables:
- `candidates` - Should have 2026 candidates
- `candidate_financials` - Should have financial data
- `committees` - Should have committee data
- `sync_logs` - Should have a completed sync entry

### Test 7: Verify Scheduler is Running

The scheduler initializes automatically when the server starts. Check console output:

```
⏰ FEC Data Sync Scheduler initialized
📅 Schedule: Every Sunday at 2:00 AM EST
🔄 Next run: Sun Dec 29 2025 02:00:00 GMT-0500
```

### Test 8: Check Individual Sync Log

Get the sync log ID from the status endpoint, then:

```bash
curl http://localhost:3001/api/sync/logs/[SYNC_LOG_ID]
```

## 🔍 Troubleshooting

### Issue: Migration fails with "DATABASE_URL not found"

**Solution**: Make sure you have a `.env` file in the `backend/` directory with `DATABASE_URL` set.

```bash
# Check if .env exists
ls -la backend/.env

# If not, create it
cp backend/ENV_SETUP.md backend/.env
# Edit .env with your actual values
```

### Issue: "FEC_API_KEY not found" on server start

**Solution**: Add your FEC API key to `.env`:

1. Get a free API key from https://api.open.fec.gov/developers/
2. Add to `.env`: `FEC_API_KEY="your-key-here"`
3. Restart the server

### Issue: No candidates synced (0 synced)

**Possible causes**:
1. FEC API key is invalid - check console for 401 errors
2. State code is wrong - use 2-letter uppercase codes (AZ, GA, etc.)
3. No 2026 data available yet - try 2024 or 2022
4. Rate limit exceeded - wait and try again

**Debug**:
```bash
# Test FEC API directly
npm run test:fec
```

### Issue: Rate limit errors

```
⏳ FEC API rate limit depleted
```

**Solution**: The rate limiter will automatically queue requests. Be patient or:
1. Reduce `batchSize` in scheduler config
2. Increase delays between batches
3. Request higher rate limit from FEC

### Issue: Server crashes during sync

**Check**:
1. Database connection is stable
2. Enough memory available
3. FEC API is responding
4. Check error logs in console or `sync_logs` table

```sql
SELECT * FROM sync_logs WHERE status = 'failed' ORDER BY started_at DESC;
```

## 📊 Expected Results

After a successful full sync (all battleground states):

- **Candidates**: 200-500 candidates (depending on states)
- **Financials**: One record per candidate
- **Committees**: 1-3 per candidate
- **Sync Duration**: 10-20 minutes
- **SyncLog Status**: "completed"

### Sample Successful Sync Output

```
🔄 SCHEDULED FEC DATA SYNC STARTED
📅 Date: 2025-12-26T15:30:00.000Z
🆔 Sync Log ID: abc-123-def-456
🗺️  States: AZ, GA, NV, PA, WI, MI, NC

📥 STEP 1: Syncing Candidates
  ✅ AZ Senate: 3 candidates
  ✅ AZ House: 9 candidates
  ✅ GA Senate: 5 candidates
  ...

📊 Candidate Sync Summary: 147 synced, 0 errors

📥 STEP 2: Syncing Financial Data + Committees
  📋 Total candidates: 147
  ⏭️  Skipped (recently synced): 0
  🔄 Need syncing: 147

  ✅ John Smith: finances=1, committees=2
  ✅ Jane Doe: finances=1, committees=1
  ...

📊 Finance Sync Summary: 147 synced, 0 errors
📊 Committee Sync Summary: 215 synced, 0 errors

✅ SCHEDULED FEC DATA SYNC COMPLETED
⏱️  Duration: 12.34 minutes
👥 Candidates: 147 synced, 0 skipped
💰 Finances: 147 synced, 0 errors
🏢 Committees: 215 synced, 0 errors
```

## 🔧 Advanced Testing

### Test Manual Trigger Function

Create a test script `backend/test-manual-sync.ts`:

```typescript
import { triggerManualSync } from './src/jobs/scheduler.js';
import { prisma } from './src/config/database.js';

async function test() {
  await prisma.$connect();
  console.log('Testing manual sync...');
  await triggerManualSync();
  await prisma.$disconnect();
}

test();
```

Run:
```bash
tsx test-manual-sync.ts
```

### Test Cron Expression Validation

```bash
node -e "
const cron = require('node-cron');
const expr = '0 2 * * 0';
console.log('Valid:', cron.validate(expr));
"
```

### Performance Testing

Monitor sync performance:

```sql
SELECT 
  sync_type,
  AVG(duration) as avg_duration_ms,
  AVG(records_processed) as avg_records,
  MAX(duration) as max_duration_ms
FROM sync_logs
WHERE status = 'completed'
GROUP BY sync_type;
```

## 📝 Notes

1. **Initial Test**: Always test with a single state first (e.g., AZ)
2. **FEC Data Lag**: FEC data has 24-48 hour delay from filings
3. **2026 Data**: Some 2026 candidates may not have filed yet - this is normal
4. **Skipped Records**: Smart skipping prevents unnecessary API calls
5. **Error Handling**: Sync continues even if individual records fail

## 🎯 Success Criteria

✅ Server starts without errors  
✅ Scheduler initializes  
✅ Database migration succeeds  
✅ Manual sync completes successfully  
✅ Candidates table populated  
✅ CampaignFinance table has data  
✅ SyncLog shows completed sync record  
✅ `/api/sync/status` returns valid data  

## 📚 Additional Resources

- [SYNC_SERVICE_DOCUMENTATION.md](./SYNC_SERVICE_DOCUMENTATION.md) - Full service documentation
- [ENV_SETUP.md](./ENV_SETUP.md) - Environment variable details
- [FEC API Docs](https://api.open.fec.gov/developers/) - FEC API reference

## 🆘 Getting Help

If you encounter issues:

1. Check console logs for errors
2. Query `sync_logs` table for error messages
3. Test FEC API connection: `npm run test:fec`
4. Verify environment variables are set correctly
5. Check database connection

