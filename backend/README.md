# 2026 Midterms Backend API

Backend API for the 2026 Federal Midterm Elections information website. Built with Node.js, Express, TypeScript, Prisma, and PostgreSQL.

## Features

- **Normalized PostgreSQL Database Schema** for candidates, committees, campaign finance, and elections
- **FEC API Integration** with rate limiting and pagination support
- **RESTful API** with comprehensive endpoints
- **Data Pipeline** for syncing FEC data to the database
- **Type-safe** with TypeScript and Prisma
- **Scalable** architecture with service layer pattern

## Prerequisites

- Node.js 18+ (for native ESM support)
- PostgreSQL database
- FEC API key (get one at https://api.data.gov/signup/)

## Installation

1. Install dependencies:
```bash
cd backend
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your DATABASE_URL and FEC_API_KEY
```

3. Generate Prisma client and run migrations:
```bash
npm run prisma:generate
npm run prisma:migrate
```

## Development

Start the development server with hot reload:
```bash
npm run dev
```

The API will be available at `http://localhost:3001/api`

## Database Schema

### Core Tables
- **candidates** - Federal candidates from FEC
- **committees** - Campaign committees
- **elections** - Primary and general elections
- **candidate_elections** - Many-to-many relationship
- **financial_summaries** - Aggregated campaign finance data
- **receipts** - Itemized contributions (Schedule A)
- **disbursements** - Itemized expenditures (Schedule B)
- **ideology_scores** - Future GovTrack-style ideology calculations

## API Endpoints

### Candidates
- `GET /api/candidates` - Get candidates with filters
  - Query params: `state`, `office`, `party`, `cycle`, `page`, `perPage`
- `GET /api/candidates/:id` - Get candidate by database ID
- `GET /api/candidates/fec/:candidateId` - Get candidate by FEC ID
- `GET /api/candidates/:id/finances` - Get candidate financial summary
- `GET /api/candidates/:id/receipts` - Get candidate receipts (paginated)
- `GET /api/candidates/:id/disbursements` - Get candidate disbursements (paginated)

### Data Sync (Admin)
- `POST /api/sync/candidates` - Sync candidates from FEC
  - Body: `{ state?, office?, cycle?, maxPages? }`
- `POST /api/sync/committees/:candidateId` - Sync committees for a candidate
- `POST /api/sync/finances/:committeeId` - Sync financial summary
  - Body: `{ cycle? }`
- `POST /api/sync/receipts/:committeeId` - Sync receipts
  - Body: `{ twoYearTransactionPeriod?, minDate?, maxDate?, maxPages? }`
- `POST /api/sync/disbursements/:committeeId` - Sync disbursements
  - Body: `{ twoYearTransactionPeriod?, minDate?, maxDate?, maxPages? }`

### Utility
- `GET /api/health` - Health check endpoint
- `GET /` - API information

## Usage Examples

### Sync 2026 Senate candidates for Arizona
```bash
curl -X POST http://localhost:3001/api/sync/candidates \
  -H "Content-Type: application/json" \
  -d '{"state": "AZ", "office": "S", "cycle": 2026, "maxPages": 5}'
```

### Get candidates for Arizona
```bash
curl http://localhost:3001/api/candidates?state=AZ&cycle=2026
```

### Get candidate finances
```bash
curl http://localhost:3001/api/candidates/{id}/finances?cycle=2026
```

## Data Pipeline

The backend includes a robust data pipeline for syncing FEC data:

1. **Rate Limiting**: Respects FEC API limits (120 requests/hour)
2. **Pagination**: Automatically handles paginated responses
3. **Error Handling**: Retry logic with exponential backoff
4. **Batch Processing**: Efficient bulk inserts for receipts/disbursements
5. **Incremental Updates**: Upsert logic to avoid duplicates

## Database Management

### Open Prisma Studio (GUI for database)
```bash
npm run prisma:studio
```

### Create a new migration
```bash
npm run prisma:migrate
```

### Reset database (WARNING: deletes all data)
```bash
npx prisma migrate reset
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio GUI

## Architecture

```
backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── src/
│   ├── config/                # Configuration (DB, FEC client, env)
│   ├── services/              # Business logic layer
│   │   ├── fec-api.service.ts     # FEC API integration
│   │   ├── candidate.service.ts   # Candidate CRUD
│   │   └── finance.service.ts     # Finance data management
│   ├── controllers/           # Request handlers
│   ├── routes/                # Express routes
│   ├── utils/                 # Utilities (rate limiter, pagination)
│   └── server.ts              # Express app
└── package.json
```

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `FEC_API_KEY` - FEC API key from data.gov
- `FEC_API_BASE_URL` - FEC API base URL (default: https://api.open.fec.gov/v1)
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `FEC_API_MAX_REQUESTS_PER_HOUR` - Rate limit (default: 120)

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Run migrations:
```bash
npx prisma migrate deploy
```

3. Start the server:
```bash
npm start
```

## Automated Data Syncing (Railway Cron Jobs)

The backend includes automated FEC data syncing via cron jobs. See [RAILWAY_CRON_SETUP.md](./RAILWAY_CRON_SETUP.md) for detailed setup instructions.

### Quick Start

```bash
# Test FEC API connection
npm run test:fec

# Run full data sync manually
npm run sync:all
```

### Railway Cron Schedule

**Schedule**: Every Monday, Wednesday, and Friday at 2 AM UTC

**What Gets Synced**:
- Candidates from battleground states (AZ, GA, NV, PA, WI, MI, NC)
- Senate and House races for 2026
- Campaign committees
- Financial summaries
- Itemized receipts and disbursements

## Future Enhancements

- [ ] Implement ideology score calculations
- [ ] Add authentication for sync endpoints
- [ ] Add caching layer (Redis)
- [ ] Add full-text search
- [ ] Add data validation schemas
- [ ] Add API documentation (Swagger)
- [ ] Add unit and integration tests
- [ ] Add monitoring and logging
- [x] Automated FEC data syncing with cron jobs

## License

MIT
