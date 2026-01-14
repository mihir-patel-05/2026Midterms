# FEC Data Sync Service Documentation

## Overview

The FEC Data Sync Service is an automated system that synchronizes candidate and campaign finance data from the Federal Election Commission (FEC) API into your PostgreSQL database. The service runs weekly on a scheduled basis and can also be triggered manually via API endpoints.

## Features

- ✅ **Automated Weekly Syncs**: Runs every Sunday at 2:00 AM EST
- ✅ **Rate Limiting**: Respects FEC API limits (120 requests/hour by default)
- ✅ **Parallel Processing**: Optimized batch processing for faster syncs
- ✅ **Error Handling**: Automatic retry logic with exponential backoff
- ✅ **Sync Logging**: Tracks all sync operations in the database
- ✅ **Manual Triggers**: API endpoints for on-demand syncing
- ✅ **Smart Skipping**: Avoids re-syncing recently updated data

## Architecture

### Components

1. **Scheduler** (`src/jobs/scheduler.ts`)
   - Initializes cron job for weekly syncs
   - Manages scheduled sync execution
   - Provides manual trigger function

2. **FEC API Service** (`src/services/fec-api.service.ts`)
   - Handles all FEC API communication
   - Includes rate limiting and pagination
   - Retry logic for failed requests

3. **Sync Routes** (`src/routes/sync.routes.ts`)
   - API endpoints for manual sync triggers
   - Status and monitoring endpoints

4. **Rate Limiter** (`src/utils/rate-limiter.ts`)
   - Uses Bottleneck library for rate limiting
   - Configurable requests per hour
   - Automatic request queuing

### Database Schema

#### SyncLog Model
Tracks all sync operations:

```prisma
model SyncLog {
  id                String      @id @default(uuid())
  syncType          String      // "candidates", "finance", "full", "committees"
  status            String      // "started", "running", "completed", "failed"
  recordsProcessed  Int         @default(0)
  recordsErrors     Int         @default(0)
  recordsSkipped    Int         @default(0)
  errorMessage      String?
  metadata          Json?       // Additional sync details
  startedAt         DateTime    @default(now())
  completedAt       DateTime?
  duration          Int?        // Duration in milliseconds
}
```

## Configuration

### Environment Variables

Create a `.env` file in the backend directory with the following variables:

```bash
# Required
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"
FEC_API_KEY="YOUR_FEC_API_KEY_HERE"

# Optional
FEC_API_BASE_URL="https://api.open.fec.gov/v1"
FEC_API_MAX_REQUESTS_PER_HOUR="120"
PORT="3001"
NODE_ENV="development"
SYNC_API_KEY="your-secret-key"  # For securing manual sync endpoints
```

### Getting an FEC API Key

1. Visit https://api.open.fec.gov/developers/
2. Sign up for a free API key
3. Add the key to your `.env` file

### Sync Configuration

Edit the sync configuration in `src/jobs/scheduler.ts`:

```typescript
const SYNC_CONFIG = {
  states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC', 'FL', 'OH', 'TX'],
  offices: ['S', 'H'], // S = Senate, H = House
  cycles: [2026],
  batchSize: 5,
  skipIfSyncedWithinHours: 12,
  maxPagesPerRequest: 3,
};
```

## API Endpoints

### Manual Sync Triggers

#### Full Sync
```bash
POST /api/sync/full
Headers: x-sync-key: YOUR_SYNC_API_KEY

# Response
{
  "message": "Full sync completed successfully",
  "note": "Check console logs for detailed progress"
}
```

#### Sync Candidates Only
```bash
POST /api/sync/candidates
Headers: x-sync-key: YOUR_SYNC_API_KEY
Body: {
  "state": "AZ",
  "office": "S",
  "cycle": 2026
}
```

#### Sync Financial Data
```bash
POST /api/sync/finances/:committeeId
Body: {
  "cycle": 2026
}
```

#### Sync Committees
```bash
POST /api/sync/committees/:candidateId
```

### Monitoring & Status

#### Get Sync Status
```bash
GET /api/sync/status?limit=10&syncType=full

# Response
{
  "summary": {
    "totalSyncs": 45,
    "completedSyncs": 42,
    "failedSyncs": 3,
    "lastSuccessfulSync": {
      "syncType": "full",
      "completedAt": "2025-12-22T02:05:30.123Z",
      "recordsProcessed": 1234,
      "duration": 125000
    }
  },
  "recentSyncs": [...]
}
```

#### Get Specific Sync Log
```bash
GET /api/sync/logs/:id

# Response
{
  "id": "uuid",
  "syncType": "full",
  "status": "completed",
  "recordsProcessed": 1234,
  "recordsErrors": 5,
  "recordsSkipped": 50,
  "startedAt": "2025-12-22T02:00:00.000Z",
  "completedAt": "2025-12-22T02:05:30.123Z",
  "duration": 330123,
  "metadata": {...}
}
```

## Usage

### Setup

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your FEC API key and database URL
   ```

3. **Run Database Migrations**
   ```bash
   npx prisma migrate dev
   ```

4. **Start the Server**
   ```bash
   npm run dev
   ```

   The scheduler will automatically initialize and the next sync will be shown in the console.

### Manual Testing

1. **Test with a Single State** (Arizona)
   
   Edit `SYNC_CONFIG.states` in `scheduler.ts` to `['AZ']` for testing.

2. **Trigger Manual Sync**
   ```bash
   curl -X POST http://localhost:3001/api/sync/full \
     -H "x-sync-key: your-secret-key"
   ```

3. **Check Sync Status**
   ```bash
   curl http://localhost:3001/api/sync/status
   ```

4. **Run Sync Script Directly** (for debugging)
   ```bash
   npm run sync:dev
   ```

### Monitoring

Monitor sync operations through:

1. **Console Logs**: Real-time progress during sync
2. **Database**: Query `sync_logs` table
3. **API Status Endpoint**: `/api/sync/status`

Example query:
```sql
SELECT * FROM sync_logs 
WHERE status = 'completed' 
ORDER BY started_at DESC 
LIMIT 10;
```

## Sync Schedule

The default schedule is **every Sunday at 2:00 AM EST**.

To modify the schedule, edit the cron expression in `src/jobs/scheduler.ts`:

```typescript
const cronExpression = '0 2 * * 0'; // Every Sunday at 2:00 AM
```

### Cron Expression Format
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
│ │ │ │ │
* * * * *
```

### Common Schedules
- Daily at 2 AM: `0 2 * * *`
- Every 6 hours: `0 */6 * * *`
- Every Monday at 3 AM: `0 3 * * 1`
- Twice weekly (Sun & Wed): `0 2 * * 0,3`

## Performance

### Optimization Features

1. **Parallel Batch Processing**: Processes multiple candidates simultaneously
2. **Smart Skipping**: Avoids re-syncing data updated within the last 12 hours
3. **Rate Limit Management**: Automatically queues requests to respect FEC limits
4. **Selective State Syncing**: Configure which states to sync

### Typical Sync Times

- **Single State (AZ)**: 2-3 minutes
- **All Battleground States** (7 states): 10-15 minutes
- **All States** (50 states): 60-90 minutes

### Rate Limiting

FEC API limits:
- **Default**: 120 requests per hour
- **Registered API Key**: Can request increase to 1,000 requests/hour

Current configuration respects the 120 requests/hour limit with automatic retry on rate limit errors.

## Error Handling

### Automatic Retry Logic

Failed requests are automatically retried up to 3 times with exponential backoff:
- 1st retry: 1 second delay
- 2nd retry: 2 second delay
- 3rd retry: 4 second delay

### Error Types Handled

1. **Rate Limit Errors**: Requests are queued and retried
2. **Network Errors**: Automatic retry with backoff
3. **API Errors**: Logged and marked in SyncLog
4. **Database Errors**: Transaction rollback where applicable

### Monitoring Failures

Check failed syncs:
```sql
SELECT * FROM sync_logs 
WHERE status = 'failed' 
ORDER BY started_at DESC;
```

View error messages:
```sql
SELECT sync_type, error_message, started_at 
FROM sync_logs 
WHERE status = 'failed';
```

## Troubleshooting

### Common Issues

#### 1. FEC API Key Invalid
```
Error: Unauthorized (401)
```
**Solution**: Verify FEC_API_KEY in `.env` file

#### 2. Rate Limit Exceeded
```
Warning: FEC API rate limit depleted
```
**Solution**: Wait for rate limit to reset (hourly) or increase FEC_API_MAX_REQUESTS_PER_HOUR if you have approval

#### 3. Database Connection Failed
```
Error: Can't reach database server
```
**Solution**: Check DATABASE_URL and ensure PostgreSQL is running

#### 4. No Data Synced
```
Candidates synced: 0
```
**Solution**: 
- Verify FEC API is accessible
- Check state codes are valid (uppercase, 2-letter)
- Ensure election cycle (2026) has data available

### Debug Mode

Enable verbose logging by setting:
```bash
NODE_ENV=development
```

Run sync script directly with full output:
```bash
npm run sync:dev
```

## Production Deployment

### Railway Setup

The sync service works seamlessly with Railway:

1. **Deploy Backend**
   ```bash
   railway link
   railway up
   ```

2. **Set Environment Variables**
   ```bash
   railway variables set FEC_API_KEY=your_key
   railway variables set DATABASE_URL=postgresql://...
   railway variables set SYNC_API_KEY=your_secret
   ```

3. **Run Migrations**
   ```bash
   railway run npx prisma migrate deploy
   ```

The scheduler will automatically start when the server starts.

### Monitoring in Production

- Use Railway logs to monitor sync operations
- Set up alerting for failed syncs (via SyncLog status)
- Query `/api/sync/status` endpoint for health checks

## Best Practices

1. **Initial Sync**: Start with a single state to test before syncing all states
2. **Sync Frequency**: Weekly is recommended for most use cases (FEC data updates daily)
3. **API Key**: Use a dedicated FEC API key for production
4. **Error Monitoring**: Set up alerts for failed syncs
5. **Database Backups**: Backup before running large syncs
6. **Rate Limits**: Monitor and adjust based on FEC API limits

## Support & Resources

- **FEC API Documentation**: https://api.open.fec.gov/developers/
- **Prisma Docs**: https://www.prisma.io/docs
- **node-cron**: https://www.npmjs.com/package/node-cron
- **Bottleneck (Rate Limiter)**: https://www.npmjs.com/package/bottleneck

## License

MIT

