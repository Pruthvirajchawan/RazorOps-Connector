# Multi-stage Dockerfile for MerchantOps Connector
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY frontend/package*.json ./frontend/

RUN npm ci
RUN cd frontend && npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY frontend/ ./frontend/

RUN npm run build

# Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DEMO_MODE=true

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist

# Persistent directory for SQLite
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data
VOLUME ["/app/data"]

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.js"]
