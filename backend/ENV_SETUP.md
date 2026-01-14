# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

```bash
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/database_name?schema=public"

# FEC API Configuration
FEC_API_KEY="YOUR_FEC_API_KEY_HERE"
FEC_API_BASE_URL="https://api.open.fec.gov/v1"
FEC_API_MAX_REQUESTS_PER_HOUR="120"

# Server Configuration
PORT="3001"
NODE_ENV="development"

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:5173"

# Sync API Key (optional security for manual sync endpoints)
SYNC_API_KEY="your-secret-sync-key"
```

## Getting an FEC API Key

1. Visit https://api.open.fec.gov/developers/
2. Sign up for a free API key (no credit card required)
3. You'll receive your API key immediately
4. Add it to your `.env` file

## Database Setup

### Local PostgreSQL

1. Install PostgreSQL if not already installed
2. Create a new database:
   ```bash
   createdb voteinformed_2026
   ```
3. Update `DATABASE_URL` in `.env` with your credentials

### Railway PostgreSQL (Production)

1. In Railway dashboard, add PostgreSQL service
2. Copy the `DATABASE_URL` from Railway
3. Add to your environment variables

## Validation

The application will validate environment variables on startup. If any required variables are missing, you'll see an error message like:

```
❌ Invalid environment variables: {
  FEC_API_KEY: [ 'Required' ]
}
```

## Next Steps

After setting up environment variables:

1. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Verify the scheduler initialized:
   ```
   ✅ Database connected successfully
   ⏰ FEC Data Sync Scheduler initialized
   📅 Schedule: Every Sunday at 2:00 AM EST
   ```

