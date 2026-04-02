# Backend API for 2026 Midterms - multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Build application
COPY src ./src/
COPY tsconfig.json ./
RUN npm run build

# Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3001

# Copy built app and runtime deps (prisma CLI in node_modules for migrate deploy)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/prisma ./prisma/

# Push schema to database (creates tables) then start server
CMD ["sh", "-c", "npx prisma generate && npx prisma db push --skip-generate && node dist/server.js"]
