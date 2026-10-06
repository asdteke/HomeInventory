# HomeInventory Docker Image
# Multi-stage, multi-architecture build (linux/amd64, linux/arm64, linux/arm/v7).
# The runtime image contains every production dependency, including the
# vendored packages under vendor/, so it starts without network access.
#
# Debian slim is used instead of Alpine because sharp only ships musl
# binaries for x64 and arm64; glibc binaries also cover 32-bit ARM.

ARG NODE_IMAGE=node:22.23.3-bookworm-slim

# ============================================
# Stage 1: Build frontend
# The output is plain static files, so it always builds on the native
# build platform instead of under emulation.
# ============================================
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci --no-audit --no-fund

COPY client/ ./
RUN npm run build

# ============================================
# Stage 2: Install production dependencies for the target platform
# Build tools stay in this stage as a fallback for native modules
# (better-sqlite3, bcrypt, sharp) without a prebuilt binary.
# ============================================
FROM ${NODE_IMAGE} AS backend-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# vendor/ must be present before npm ci: package.json links "uuid" to it.
COPY package*.json ./
COPY vendor/ ./vendor/
# After install, drop files the glibc runtime never loads: SQLite sources
# (only needed to compile better-sqlite3) and sharp's musl/wasm fallbacks.
RUN npm ci --omit=dev --no-audit --no-fund \
    && rm -rf node_modules/better-sqlite3/deps node_modules/better-sqlite3/src \
              node_modules/@img/sharp-linuxmusl-* node_modules/@img/sharp-libvips-linuxmusl-* \
              node_modules/@img/sharp-wasm32 \
    && npm cache clean --force

# ============================================
# Stage 3: Production runtime
# ============================================
FROM ${NODE_IMAGE} AS runner

LABEL org.opencontainers.image.title="HomeInventory" \
      org.opencontainers.image.description="Private, self-hostable household inventory for shared homes" \
      org.opencontainers.image.source="https://github.com/asdteke/HomeInventory" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --no-create-home homeinv

# Copy built assets
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/client/dist ./client/dist
COPY --from=frontend-builder /app/client/public/locales ./client/public/locales

# Copy application files
COPY app.js server.js auth.js database.js ./
COPY config/ ./config/
COPY middleware/ ./middleware/
COPY routes/ ./routes/
COPY utils/ ./utils/
COPY locales/ ./locales/
# scripts/ includes setup.mjs, which generates Docker secret files from the
# published image without a source checkout (see DOCKER.md).
COPY scripts/ ./scripts/
COPY vendor/ ./vendor/
COPY package.json ./

# Ensure the non-root runtime user can read the bundled app files.
RUN chmod -R a+rX /app && \
    mkdir -p /app/data /app/uploads && \
    chown -R homeinv:nodejs /app/data /app/uploads

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3001
# Application files are read-only for the runtime user; keep error logs on the data volume.
ENV HOMEINVENTORY_LOG_DIR=/app/data/logs

# Expose port
EXPOSE 3001

# Health check (Debian slim has no wget/curl; Node's fetch is enough)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Switch to non-root user
USER homeinv

# Start the application
CMD ["node", "server.js"]
