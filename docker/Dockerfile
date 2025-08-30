# docker/Dockerfile - Multi-stage build for optimal production images

# ===== BUILD STAGE =====
FROM node:18-alpine AS builder

# Set build arguments
ARG NODE_ENV=production
ARG BUILD_DATE
ARG VERSION
ARG COMMIT_SHA

# Add metadata labels
LABEL maintainer="School ERP Team <dev@school-erp.com>"
LABEL version="${VERSION}"
LABEL build-date="${BUILD_DATE}"
LABEL commit-sha="${COMMIT_SHA}"
LABEL description="School ERP SaaS Application"

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S school-erp -u 1001

# Set ownership
RUN chown -R school-erp:nodejs /app

# ===== PRODUCTION STAGE =====
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    tzdata

# Set timezone
ENV TZ=UTC

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S school-erp -u 1001

# Copy built application from builder stage
COPY --from=builder --chown=school-erp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=school-erp:nodejs /app/src ./src
COPY --from=builder --chown=school-erp:nodejs /app/package*.json ./
COPY --from=builder --chown=school-erp:nodejs /app/yarn.lock* ./

# Create necessary directories
RUN mkdir -p /app/logs /app/temp /app/uploads && \
    chown -R school-erp:nodejs /app/logs /app/temp /app/uploads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DEPLOYMENT_TYPE=docker

# Switch to non-root user
USER school-erp

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]
