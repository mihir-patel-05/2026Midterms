# FEC Sync Service - Quick Reference

## 🚀 Quick Commands

### Setup
```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Start server
npm run dev
```

### Manual Sync
```bash
# Full sync (all states)
curl -X POST http://localhost:3001/api/sync/full \
  -H "x-sync-key: your-secret-key"

# Sync single state
curl -X POST http://localhost:3001/api/sync/candidates \
  -H "Content-Type: application/json" \
  -d '{"state": "AZ", "office": "S", "cycle": 2026}'

# Run sync script directly
npm run sync:dev
```

### Monitoring
```bash
# Check sync status
curl http://localhost:3001/api/sync/status

# Get specific sync log
curl http://localhost:3001/api/sync/logs/[ID]

# View database
npx prisma studio
```

## 📅 Sync Schedule

**Default**: Every Sunday at 2:00 AM EST  
**Cron**: `0 2 * * 0`

Change in: `src/jobs/scheduler.ts`

## 🔑 Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `FEC_API_KEY` - From https://api.open.fec.gov/developers/
- `SYNC_API_KEY` - For API endpoint security (optional)

## 📊 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/sync/full` | Trigger full sync |
| POST | `/api/sync/candidates` | Sync specific candidates |
| POST | `/api/sync/finances/:id` | Sync financial data |
| POST | `/api/sync/committees/:id` | Sync committees |
| GET | `/api/sync/status` | Get sync history |
| GET | `/api/sync/logs/:id` | Get detailed log |

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Migration fails | Check `DATABASE_URL` in `.env` |
| 401 Unauthorized | Verify `FEC_API_KEY` is valid |
| Rate limit errors | Wait or reduce `batchSize` |
| No data synced | Check state codes (uppercase) |
| Server won't start | Run `npx prisma generate` |

## 📁 Key Files

- `src/jobs/scheduler.ts` - Scheduler configuration
- `src/routes/sync.routes.ts` - API endpoints
- `prisma/schema.prisma` - Database schema
- `.env` - Environment variables

## 🔧 Configuration

### Change sync states
```typescript
// src/jobs/scheduler.ts
states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC'],
```

### Change schedule
```typescript
// src/jobs/scheduler.ts
const cronExpression = '0 2 * * 0'; // Every Sunday at 2 AM
```

### Adjust rate limit
```bash
# .env
FEC_API_MAX_REQUESTS_PER_HOUR="120"
```

## 📚 Documentation

- `IMPLEMENTATION_SUMMARY.md` - Overview
- `SETUP_AND_TESTING.md` - Detailed setup guide
- `SYNC_SERVICE_DOCUMENTATION.md` - Full documentation
- `ENV_SETUP.md` - Environment configuration

## ✅ Health Check

```bash
# Server running?
curl http://localhost:3001/api/health

# Database connected?
npx prisma db pull

# Scheduler active?
# Check console output on server start
```

## 🎯 Testing Checklist

```bash
# 1. Setup
npm install
npx prisma migrate dev
npm run dev

# 2. Test single state
curl -X POST http://localhost:3001/api/sync/candidates \
  -H "Content-Type: application/json" \
  -d '{"state": "AZ", "office": "S", "cycle": 2026}'

# 3. Check results
curl http://localhost:3001/api/sync/status
npx prisma studio

# 4. Full sync (if test passed)
curl -X POST http://localhost:3001/api/sync/full \
  -H "x-sync-key: your-secret-key"
```

## 🚨 Emergency Stop

If a sync is running and you need to stop it:

```bash
# Restart the server
# Ctrl+C in the terminal running npm run dev

# Or if running in background
pkill -f "node.*server"
```

Incomplete syncs will be marked as "failed" in the sync_logs table.

## 📞 Support

Check logs in this order:
1. Console output (real-time)
2. `sync_logs` table (database)
3. `GET /api/sync/status` (API)

Common log locations:
- Console: Real-time server output
- Database: `SELECT * FROM sync_logs ORDER BY started_at DESC`
- API: `curl http://localhost:3001/api/sync/status`

