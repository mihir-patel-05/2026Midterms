# Quick Deploy Guide - Railway Backend

**TL;DR:** Deploy your backend to Railway in 5 minutes.

## Prerequisites
- [ ] Railway account (https://railway.app)
- [ ] Git initialized in your project
- [ ] PostgreSQL already on Railway ✅

## Quick Deploy Steps

### 1. Install & Login (One-time)
```bash
npm install -g @railway/cli
railway login
```

### 2. Initialize Project
```bash
cd backend
railway init
# Name: 2026-midterms-api
```

### 3. Set Environment Variables
```bash
railway variables set NODE_ENV=production
railway variables set FRONTEND_URL=https://your-frontend.vercel.app
```

> **Note:** DATABASE_URL, FEC_API_KEY already configured ✅

### 4. Deploy
```bash
git add .
git commit -m "Deploy to Railway"
railway up
```

### 5. Get Your URL
```bash
railway domain
```

Copy the URL (e.g., `https://2026-midterms-api.up.railway.app`)

### 6. Update Frontend
In `CODE/.env`:
```env
VITE_API_URL=https://your-backend-url.railway.app
```

### 7. Test
```bash
curl https://your-backend-url.railway.app/api/health
```

## That's It! 🎉

Your backend is now deployed and accessible at the Railway URL.

---

## Useful Commands

```bash
# View logs
railway logs

# Restart service
railway restart

# Open in browser
railway open

# Check variables
railway variables

# Redeploy
railway up
```

## Troubleshooting

**Build fails?**
```bash
npm run build  # Test locally first
```

**Can't connect?**
```bash
railway logs  # Check error logs
```

**CORS errors?**
Update `FRONTEND_URL` variable and redeploy.

---

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
