# Railway Cron Job Setup Guide

This guide explains how to set up automated FEC data syncing on Railway that runs **every Monday, Wednesday, and Friday at 2 AM UTC**.

## 📋 Overview

The backend includes a cron job system that automatically fetches and updates:
- Federal candidates (Senate and House)
- Campaign committees
- Financial summaries
- Itemized receipts and disbursements

## 🚀 Quick Setup on Railway

### Option 1: Using Railway Cron Jobs (Recommended)

Railway supports native cron jobs through their platform. Here's how to set it up:

1. **Deploy Your Backend to Railway**
   ```bash
   # If you haven't already, initialize Railway
   railway init

   # Link to your project
   railway link

   # Deploy
   railway up
   ```

2. **Add Cron Job Service**

   In your Railway dashboard:
   - Go to your project
   - Click "New" → "Service"
   - Select "Cron Job"
   - Configure:
     - **Name**: `fec-sync-cron`
     - **Schedule**: `0 2 * * 1,3,5` (Mon/Wed/Fri at 2 AM UTC)
     - **Command**: `npm run sync:all`
     - **Source**: Same repository as your main backend

3. **Environment Variables**

   The cron job will automatically use the same environment variables as your main service:
   - `DATABASE_URL`
   - `FEC_API_KEY`
   - `FEC_API_BASE_URL`
   - `NODE_ENV`

4. **Monitor Logs**

   View cron job execution logs in the Railway dashboard:
   - Go to your project
   - Select the `fec-sync-cron` service
   - Click "Logs" tab

### Option 2: Manual Deployment with railway.toml

If Railway supports `railway.toml` in your plan:

1. The `railway.toml` file is already configured in the repository
2. Deploy your backend:
   ```bash
   railway up
   ```
3. Railway will automatically detect the cron configuration

## 📅 Cron Schedule Explained

```
0 2 * * 1,3,5
│ │ │ │ └─────── Day of week (1,3,5 = Mon, Wed, Fri)
│ │ │ └───────── Month (*)
│ │ └─────────── Day of month (*)
│ └───────────── Hour (2 = 2 AM UTC)
└─────────────── Minute (0)
```

**Schedule**: Every Monday, Wednesday, and Friday at 2 AM UTC

**Timezone Conversions**:
- **PST/PDT**: 6 PM (previous day) / 7 PM (previous day)
- **EST/EDT**: 9 PM (previous day) / 10 PM (previous day)
- **CST/CDT**: 8 PM (previous day) / 9 PM (previous day)

## 🛠️ Manual Testing

### Test FEC API Connection

Before deploying, test that your FEC API key works:

```bash
npm run test:fec
```

This will:
1. Connect to the FEC API
2. Fetch Arizona Senate candidates for 2026
3. Retrieve committee and financial data
4. Display results

**Expected Output**:
```
✅ All FEC API Tests Passed!
```

### Run Full Sync Manually

Test the complete sync process locally:

```bash
npm run sync:all
```

This will sync:
- Candidates from battleground states (AZ, GA, NV, PA, WI, MI, NC)
- Senate and House races
- 2026 election cycle
- Campaign finance data

**Duration**: Typically 5-15 minutes depending on data volume

## ⚙️ Configuration

### Customize Sync Settings

Edit `/Users/mihirpatel/Downloads/2026Midterms/backend/src/jobs/sync-all-data.ts`:

```typescript
const SYNC_CONFIG = {
  // Add or remove states
  states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC'],

  // S = Senate, H = House
  offices: ['S', 'H'],

  // Election cycles
  cycles: [2026],

  // Adjust to fetch more/less data per state
  maxPagesPerRequest: 3,

  // Enable/disable financial data sync
  syncFinances: true,

  // Last 4 years for receipts/disbursements
  transactionPeriods: [2024, 2026],

  // Limit pages for financial data (can be very large)
  maxFinancePages: 2,
};
```

### Change Cron Schedule

To run on different days/times, modify the cron expression in Railway:

**Examples**:
- Daily at midnight: `0 0 * * *`
- Every weekday at 3 AM: `0 3 * * 1-5`
- Every Sunday at noon: `0 12 * * 0`
- Every 6 hours: `0 */6 * * *`

Use [crontab.guru](https://crontab.guru/) to build custom schedules.

## 📊 Monitoring & Logs

### View Sync Results

The cron job outputs detailed logs:

```
============================================================
🚀 Starting FEC Data Sync
============================================================
📅 Date: 2025-12-15T02:00:00.000Z
🗺️  States: AZ, GA, NV, PA, WI, MI, NC
🏛️  Offices: S, H
📊 Cycles: 2026
============================================================

📥 STEP 1: Syncing Candidates
  ✅ Synced 5 candidates (0 errors)

📥 STEP 2: Syncing Committees
  ✅ 25 committees synced

📥 STEP 3: Syncing Financial Summaries
  ✅ 25 financial summaries synced

📥 STEP 4: Syncing Receipts (Sample)
  ✅ 500 receipts synced

============================================================
✅ FEC Data Sync Complete!
============================================================
⏱️  Duration: 8.5 minutes
```

### Check Database

After a sync completes, verify data in Prisma Studio:

```bash
npm run prisma:studio
```

Or query the database directly:

```sql
-- Count candidates
SELECT COUNT(*) FROM candidates;

-- Recent financial summaries
SELECT * FROM financial_summaries ORDER BY last_updated DESC LIMIT 10;

-- Top contributors
SELECT contributor_name, SUM(contribution_receipt_amount) as total
FROM receipts
GROUP BY contributor_name
ORDER BY total DESC
LIMIT 10;
```

## 🔧 Troubleshooting

### Cron Job Not Running

1. **Check Railway Logs**
   - Verify the cron job service is active
   - Look for error messages in logs

2. **Verify Environment Variables**
   ```bash
   railway variables
   ```
   Ensure `DATABASE_URL` and `FEC_API_KEY` are set

3. **Test Locally**
   ```bash
   npm run sync:all
   ```
   If it works locally, the issue is with Railway configuration

### Rate Limit Errors

If you see `429 Too Many Requests`:

1. Reduce `maxPagesPerRequest` in `sync-all-data.ts`
2. Reduce number of states in `SYNC_CONFIG.states`
3. Increase delays between requests (edit `sleep()` calls)

### Database Errors

If you see database connection errors:

1. Verify `DATABASE_URL` is correct
2. Check Railway database is running
3. Ensure database has enough storage space

### Empty Results

If sync completes but no data appears:

1. Check FEC API key is valid
2. Verify the election cycle exists (2026 data may be limited early in the cycle)
3. Try a different state with more active races

## 📈 Performance Optimization

### Reduce Sync Time

1. **Sync Fewer States**
   ```typescript
   states: ['AZ', 'GA', 'NV'], // Instead of all 7
   ```

2. **Skip Financial Details**
   ```typescript
   syncFinances: false, // Only sync candidates
   ```

3. **Limit Transaction History**
   ```typescript
   transactionPeriods: [2026], // Only current cycle
   ```

### Increase Data Coverage

1. **Add More States**
   ```typescript
   states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC', 'FL', 'TX', 'CA'],
   ```

2. **Fetch More Pages**
   ```typescript
   maxPagesPerRequest: 10,
   maxFinancePages: 5,
   ```

3. **Sync All Committees (Not Just Top 10)**
   Edit the receipts sync section to process all committees

## 🎯 Next Steps

1. ✅ Deploy backend to Railway
2. ✅ Set up cron job with schedule `0 2 * * 1,3,5`
3. ✅ Monitor first execution
4. 🔄 Adjust configuration as needed
5. 📊 Build frontend to display the data

## 📚 Additional Resources

- [Railway Docs - Cron Jobs](https://docs.railway.app/guides/cron-jobs)
- [FEC API Documentation](https://api.open.fec.gov/developers/)
- [Cron Expression Generator](https://crontab.guru/)
- [Prisma Documentation](https://www.prisma.io/docs)

## 💡 Tips

- **Start Small**: Begin with 2-3 states, then expand
- **Monitor Costs**: Each sync uses Railway compute time
- **Rate Limits**: FEC API allows 120 requests/hour
- **Data Freshness**: FEC updates data daily, so frequent syncing is valuable
- **Backup Strategy**: Railway databases are backed up automatically, but consider periodic exports
