# ==========================================
# Stage 1: Build & Dependencies
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package files for dependency caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# ==========================================
# Stage 2: Hardened Production Runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    PORT=8080

# Security: Install curl for healthcheck, then remove apk cache
RUN apk --no-cache add curl

# Copy dependencies and application code
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/

# Security: Change ownership to unprivileged built-in node user
RUN chown -R node:node /usr/src/app

# Run as non-root user
USER node

# Expose standard application port
EXPOSE 8080

# Docker-level health check (Kubernetes will use its own liveness probe)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "src/server.js"]
