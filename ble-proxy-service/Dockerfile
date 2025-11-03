FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    libbluetooth-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt


FROM python:3.11-slim

# Install only runtime Bluetooth dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    bluez \
    bluetooth \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 bleproxy

# Copy Python packages from builder
COPY --from=builder /root/.local /home/bleproxy/.local

# Set working directory
WORKDIR /app

# Copy application code
COPY __init__.py main.py schemas.py ble_manager.py ./

# Update PATH for user-installed packages
ENV PATH=/home/bleproxy/.local/bin:$PATH

# Switch to non-root user
USER bleproxy

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8081/health')"

# Run application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8081"]
