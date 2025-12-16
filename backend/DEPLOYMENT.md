# Backend Deployment Guide - Railway

This guide will walk you through deploying the 2026 Midterms backend API as a standalone Railway service.

## 📋 Prerequisites

Before you begin, make sure you have:

- [ ] Railway account (sign up at https://railway.app)
- [ ] Railway CLI installed
- [ ] Git repository initialized
- [ ] PostgreSQL database (already set up on Railway ✅)
- [ ] Node.js 18+ installed locally

## 🚀 Deployment Steps

### Step 1: Install Railway CLI

```bash
# Install Railway CLI globally
npm install -g @railway/cli

# Verify installation
railway --version
```

### Step 2: Login to Railway

```bash
# Login to Railway (opens browser)
railway login

# Verify you're logged in
railway whoami
```

### Step 3: Initialize Railway Project

```bash
# Navigate to backend directory
cd backend

# Link to existing Railway project (if you have one)
railway link

# OR create a new Railway project
railway init
```

**Choose a project name:**
```
Project name: 2026-midterms-api
```

### Step 4: Set Environment Variables

You need to set these environment variables in Railway:

```bash
# Set production environment
railway variables set NODE_ENV=production

# Set port (Railway will also set this automatically)
railway variables set PORT=3001

# Set frontend URL (update with your actual frontend URL after deployment)
railway variables set FRONTEND_URL=https://your-frontend.vercel.app

# FEC API Key (already have this)
railway variables set FEC_API_KEY=MZHQDPqUKjrbJEmqYvwEKgrf8Q0FfGjwAsFamjTe

# FEC API Base URL
railway variables set FEC_API_BASE_URL=https://api.open.fec.gov/v1

# Rate limiting
railway variables set FEC_API_MAX_REQUESTS_PER_HOUR=120
```

**Note:** Your `DATABASE_URL` should already be set from your existing PostgreSQL database on Railway.

### Step 5: Verify Railway Configuration Files

Make sure these files exist in your `backend/` directory:

**`railway.json`:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**`railway.toml`:**
```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
```

**`package.json` scripts:**
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate"
  }
}
```

### Step 6: Update CORS Configuration

Edit `backend/src/server.ts` to allow your frontend domain:

```typescript
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || '*',
    'http://localhost:5173',  // Local development
    'http://localhost:3000',  // Alternative local port
  ],
  credentials: true,
}));
```

### Step 7: Commit Your Changes

```bash
# Make sure all changes are committed
git add .
git commit -m "Configure backend for Railway deployment"
```

### Step 8: Deploy to Railway

```bash
# Deploy from backend directory
railway up

# OR deploy and watch logs
railway up --detach
railway logs
```

Railway will:
1. ✅ Build your TypeScript code
2. ✅ Install dependencies
3. ✅ Generate Prisma client
4. ✅ Start the server
5. ✅ Assign a public URL

### Step 9: Get Your Backend URL

```bash
# Get the deployment URL
railway domain

# Or view in browser
railway open
```

Your backend will be available at something like:
```
https://2026-midterms-api-production.up.railway.app
```

### Step 10: Test Your Deployed Backend

```bash
# Test health endpoint
curl https://your-backend-url.railway.app/api/health

# Test candidates endpoint
curl https://your-backend-url.railway.app/api/candidates
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-16T07:00:00.000Z",
  "service": "2026 Midterms API"
}
```

## 🔧 Post-Deployment Configuration

### Update Frontend Environment Variables

Update your **frontend** `.env` file:

```env
# Production API URL (from Railway)
VITE_API_URL=https://your-backend-xyz.railway.app

# For local development, comment out and use:
# VITE_API_URL=http://localhost:3001
```

### Set Up Custom Domain (Optional)

```bash
# Add custom domain in Railway dashboard
# Example: api.yourdomain.com

# Or via CLI
railway domain add api.yourdomain.com
```

Then add a CNAME record in your DNS:
```
Type: CNAME
Name: api
Value: your-project.railway.app
```

## 🔄 Setting Up Cron Jobs (Optional)

To automatically sync FEC data, set up a Railway cron job:

### Method 1: Railway Cron Service

1. Go to Railway Dashboard
2. Click "New Service"
3. Choose "Cron Job"
4. Configure:
   ```
   Schedule: 0 2 * * 1,3,5  (Mon/Wed/Fri at 2 AM)
   Command: npm run sync:all
   ```

### Method 2: External Cron Service

Use a service like Cron-job.org or EasyCron to hit an endpoint:

```bash
# Add a sync endpoint to trigger data sync
POST https://your-backend.railway.app/api/sync/all
Authorization: Bearer your-secret-token
```

## 📊 Monitoring & Logs

### View Logs

```bash
# Real-time logs
railway logs

# Follow logs
railway logs --follow
```

### Monitor in Dashboard

Visit Railway Dashboard to see:
- ✅ Deployment status
- ✅ CPU/Memory usage
- ✅ Request metrics
- ✅ Error rates

## 🐛 Troubleshooting

### Issue: Build Fails

**Solution:**
```bash
# Check that package.json has correct scripts
npm run build  # Test locally first

# Check Prisma generation
npx prisma generate
```

### Issue: Database Connection Error

**Solution:**
```bash
# Verify DATABASE_URL is set
railway variables

# Test connection locally
npx prisma db push
```

### Issue: CORS Errors

**Solution:**
Update `src/server.ts`:
```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
```

Then redeploy:
```bash
railway up
```

### Issue: Port Conflicts

**Solution:**
Railway automatically sets the `PORT` variable. Make sure your server uses it:

```typescript
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

### Issue: Environment Variables Not Working

**Solution:**
```bash
# List all variables
railway variables

# Set missing variable
railway variables set VARIABLE_NAME=value

# Restart service
railway restart
```

## 🔐 Security Best Practices

### 1. Environment Variables

- ✅ Never commit `.env` files
- ✅ Use Railway's secure variable storage
- ✅ Rotate API keys regularly

### 2. CORS Configuration

- ✅ Only allow specific frontend domains in production
- ✅ Don't use `*` wildcard in production

### 3. Rate Limiting

Already configured in your app:
```typescript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api', limiter);
```

## 📈 Scaling & Performance

### Automatic Scaling

Railway automatically scales based on:
- CPU usage
- Memory usage
- Request volume

### Manual Scaling

In Railway Dashboard:
1. Go to your service
2. Click "Settings"
3. Adjust "Replicas" (Pro plan required)

### Database Connection Pooling

Already configured with Prisma:
```typescript
const prisma = new PrismaClient({
  log: ['error'],
});
```

## 💰 Cost Estimation

### Railway Pricing

**Free Tier:**
- $5 free credits per month
- Good for development/testing

**Pro Plan ($20/month):**
- $0.000231 per GB-hour
- Estimated cost for this app: $5-15/month
- Includes custom domains, cron jobs, replicas

**Database:**
- Shared PostgreSQL: Included
- Dedicated PostgreSQL: +$15/month

## 🎯 Deployment Checklist

Before deploying, ensure:

- [ ] All environment variables are set
- [ ] Database migrations are applied
- [ ] CORS is configured for production
- [ ] Health check endpoint works
- [ ] Build script runs successfully
- [ ] Start script works in production mode
- [ ] API endpoints are tested
- [ ] Error logging is configured
- [ ] Rate limiting is enabled
- [ ] Railway config files are present

## 🚢 Continuous Deployment

### Option 1: GitHub Integration

1. Push code to GitHub
2. Connect GitHub repo to Railway
3. Railway auto-deploys on push to `main`

### Option 2: Manual Deployment

```bash
# Deploy manually
railway up

# Deploy specific branch
railway up --branch production
```

## 🔄 Rollback

If something goes wrong:

```bash
# View deployments
railway deployments

# Rollback to previous deployment
railway rollback [deployment-id]
```

## 📞 Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Prisma Docs: https://www.prisma.io/docs

## ✅ Next Steps After Deployment

1. **Test all endpoints** from production URL
2. **Update frontend** with production API URL
3. **Deploy frontend** to Vercel/Netlify
4. **Set up cron jobs** for data syncing
5. **Configure monitoring** and alerts
6. **Add custom domain** (optional)
7. **Set up CI/CD** pipeline (optional)

---

## Quick Deploy Commands

```bash
# One-time setup
npm install -g @railway/cli
railway login
cd backend
railway init

# Set variables
railway variables set NODE_ENV=production
railway variables set FRONTEND_URL=https://your-frontend.vercel.app

# Deploy
git add . && git commit -m "Deploy to Railway"
railway up

# Get URL
railway domain

# View logs
railway logs --follow
```

---

**Deployment Date:** _Add date here_
**Backend URL:** _Add URL after deployment_
**Frontend URL:** _Add URL after frontend deployment_
