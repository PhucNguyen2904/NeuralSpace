FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    git \
    postgresql-client \
    openssh-client \
    rclone \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /storage-configs && chown -R 1000:1000 /storage-configs

# DVC managed repo root — ephemeral trong production, tự clone lại khi cần
RUN mkdir -p /tmp/dvc-repos && mkdir -p /tmp/dvc-repo

# Copy project files
COPY pyproject.toml ./
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -e .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Production: 1 worker (Render free = 1 CPU, 512MB RAM)
# Dùng biến WORKERS để override nếu cần (ví dụ: WORKERS=2 cho paid tier)
CMD uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers ${WORKERS:-1} \
    --proxy-headers \
    --forwarded-allow-ips='*'
