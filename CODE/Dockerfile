# Frontend - multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at build time. Railway passes service variables as build
# args; declared ARGs are visible to the RUN below as environment variables.
ARG VITE_API_URL
ARG VITE_FEATURE_ELECTION_DASHBOARD
ARG VITE_RESULTS_PROVIDER_MOCK_ENABLED
RUN npm run build

# Serve with nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway injects PORT at runtime; default to 80 elsewhere (e.g. docker-compose).
ENV PORT=80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
