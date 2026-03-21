# HomeInventory Docker Image
# Multi-stage build for optimal size

# ============================================
# Stage 1: Build frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# Install frontend dependencies
COPY client/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY client/ ./
RUN npm run build

# ============================================
# Stage 2: Build backend with native modules
# ============================================
FROM node:20-alpine AS backend-builder

# Install build dependencies for native modules (better-sqlite3, sharp)
RUN apk add --no-cache python3 make g++ 

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm ci --only=production

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:20-alpine AS runner

# Install runtime dependencies for sharp
RUN apk add --no-cache vips-dev

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S homeinv -u 1001 -G nodejs

# Copy built assets
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/client/dist ./client/dist

# Copy application files
COPY server.js auth.js database.js ./
COPY config/ ./config/
COPY middleware/ ./middleware/
COPY routes/ ./routes/
COPY utils/ ./utils/
COPY locales/ ./locales/
COPY scripts/ ./scripts/
COPY package.json ./

# Create directories for persistent data
RUN mkdir -p /app/data /app/uploads && \
    chown -R homeinv:nodejs /app/data /app/uploads

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/inventory.db
ENV UPLOADS_PATH=/app/uploads

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Switch to non-root user
USER homeinv

# Start the application
CMD ["node", "server.js"]
