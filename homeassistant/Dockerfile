# BUILD_FROM is passed by Home Assistant builder from build.yaml
# Must be declared globally for multi-stage builds
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.22
ARG BUILD_VERSION=0.0.0

# ============================================================================
# Stage 1: Backend build
# ============================================================================
# Use build platform (not target) to avoid slow QEMU cross-compilation
FROM --platform=$BUILDPLATFORM python:3.12-slim AS backend-build

WORKDIR /backend

# Install build dependencies for compiling Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN pip install --no-cache-dir poetry==1.8.5

# Copy backend dependency files
COPY backend/pyproject.toml backend/poetry.lock ./

# Export dependencies to requirements.txt
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes --without dev

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/app /backend/app

# ============================================================================
# Stage 2: Frontend build
# ============================================================================
# Use build platform (not target) to avoid slow QEMU cross-compilation
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-build

WORKDIR /frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy frontend source
COPY frontend/ ./

# Build Next.js in standalone mode for Home Assistant
ENV DEPLOYMENT_MODE=homeassistant
ENV BACKEND_URL=http://localhost:80
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ============================================================================
# Stage 3: Final runtime image
# ============================================================================
# Re-declare BUILD_FROM for this stage
ARG BUILD_FROM
ARG BUILD_VERSION
FROM ${BUILD_FROM}

# Install runtime dependencies
RUN apk add --no-cache \
    python3=~3.12 \
    py3-pip \
    nodejs \
    npm \
    dbus \
    bluez \
    bluez-deprecated \
    curl \
    jq

# Copy backend from build stage
COPY --from=backend-build /backend/app /app/backend/app
COPY --from=backend-build /usr/local/lib/python3.12/site-packages /usr/lib/python3.12/site-packages

# Copy frontend from build stage
COPY --from=frontend-build /frontend/.next/standalone /app/frontend
COPY --from=frontend-build /frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-build /frontend/public /app/frontend/public

# Copy add-on files (build context is repo root, so prefix with homeassistant/)
COPY homeassistant/run.sh /
COPY homeassistant/rootfs /

# Make scripts executable
RUN chmod +x /run.sh && \
    chmod +x /etc/services.d/backend/run && \
    chmod +x /etc/services.d/frontend/run

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Expose ports (for documentation - ingress handles actual access)
EXPOSE 3000

# Labels
ENV ADDON_VERSION="${BUILD_VERSION}"

LABEL \
    io.hass.name="SFPLiberate" \
    io.hass.description="Bluetooth companion for Ubiquiti SFP Wizard" \
    io.hass.arch="aarch64|amd64|armhf|armv7" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}" \
    maintainer="Josiah Nelson <https://github.com/josiah-nelson>" \
    org.opencontainers.image.title="SFPLiberate" \
    org.opencontainers.image.description="Bluetooth companion for Ubiquiti SFP Wizard" \
    org.opencontainers.image.vendor="SFPLiberate" \
    org.opencontainers.image.authors="Josiah Nelson" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/josiah-nelson/SFPLiberate" \
    org.opencontainers.image.source="https://github.com/josiah-nelson/SFPLiberate" \
    org.opencontainers.image.documentation="https://github.com/josiah-nelson/SFPLiberate/blob/main/docs/HOME_ASSISTANT.md" \
    org.opencontainers.image.version="${BUILD_VERSION}"

# Start via s6-overlay (base image handles this)
CMD ["/run.sh"]
