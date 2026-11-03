# War Room landing page

The public homepage for the War Room dashboard: what it is, what each module does, tonight's poll closings, and a
**Launch dashboard** button that opens the real War Room. Plain HTML, CSS and a little JavaScript, served by nginx.
It does not import anything from `CODE/` or call the API, so it can't affect the dashboard.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `WAR_ROOM_URL` | `https://2026midterms-testing.up.railway.app/war-room` | Where every Launch button goes. No trailing slash: module cards add `/map`, `/night` and so on. |
| `SITE_URL` | `https://2026midterms-testing.up.railway.app` | The main VoteInformed site (footer link, share image). |
| `PORT` | `80` | Set by Railway. |

nginx fills these in when the container starts, so changing one on Railway only needs a restart, not a rebuild.

## Deploying on Railway

Make a service from this repo with **Root Directory** `/landing`. Railway finds the Dockerfile. Generate a domain
on the port it listens on (Railway sets `PORT`, usually 8080). Health check path: `/healthz`.

## Running it locally

```
docker build -t war-room-landing landing && docker run --rm -p 8080:80 war-room-landing
```

Or open `index.html` straight from disk; the links then fall back to the live site.

The poll closing times in `app.js` are copied from `CODE/src/features/war-room/night/pollClosings.ts`. Change both
together.
