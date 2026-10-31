# Frontend - multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at build time. Railway passes service variables as build
# args; declared ARGs are visible to the RUN below as environment variables.
# Every import.meta.env.VITE_* name in src needs an ARG here, or setting it on
# Railway does nothing. `npm run check:build-args` fails when one is missing.
ARG VITE_API_URL
ARG VITE_FEATURE_ELECTION_DASHBOARD
ARG VITE_RESULTS_PROVIDER_MOCK_ENABLED
ARG VITE_FEATURE_NEW_FRONTEND
ARG VITE_MAP_STYLE_URL
ARG VITE_FEATURE_DEMOGRAPHICS
ARG VITE_FEATURE_NEWS
ARG VITE_FEATURE_MARKET_HISTORY
ARG VITE_FEATURE_MOVERS
ARG VITE_FEATURE_ECONOMY
ARG VITE_FEATURE_PAST_RESULTS
ARG VITE_FEATURE_SIMULATOR
ARG VITE_FEATURE_ODDS_MAP
ARG VITE_FEATURE_POLLS
ARG VITE_FEATURE_NATIONAL_POLLS
ARG VITE_FEATURE_WAR_ROOM
RUN npm run build

# Serve with nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway injects PORT at runtime; default to 80 elsewhere (e.g. docker-compose).
ENV PORT=80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
