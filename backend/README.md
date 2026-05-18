# ML Model Download & Management Service

Async backend service for downloading large machine learning models from HuggingFace, GitHub Releases, and direct URLs. Features resume capability, SHA-256 verification, disk space management, and real-time progress tracking.

## Architecture

```
User Request
    ↓
FastAPI (HTTP Handler)
    ↓
Task Service (Create task in DB)
    ↓
Celery Worker (Async download)
    ↓
Storage Service (File management)
    ↓
Downloader (HF/GitHub/Direct URL)
    ↓
Local Storage
```

## Tech Stack

- **Python 3.11+** with FastAPI & Uvicorn
- **PostgreSQL 15+** for persistence
- **Redis 7+** for message broker & progress tracking
- **Celery 5.x** for async task processing
- **SQLAlchemy 2.x** async ORM with Alembic migrations
- **Docker Compose** for orchestration

## Quick Start

### 1. Clone & Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your settings
```

### 2. Start Services

```bash
docker-compose up --build
```

This brings up:
- API: http://localhost:8000
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- Celery Worker: background process
- Celery Beat: scheduler (recovery tasks)

### 3. Test Download

```bash
# POST /api/v1/models/download
curl -X POST http://localhost:8000/api/v1/models/download \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "huggingface",
    "source_identifier": "mistralai/Mistral-7B-v0.1",
    "priority": 1,
    "tags": ["llm", "7b"]
  }'

# Response: {"task_id": "dl_xxx", "status": "PENDING", ...}

# GET /api/v1/tasks/{task_id}
curl http://localhost:8000/api/v1/tasks/dl_xxx
```

## API Reference

### Download Task Endpoints

#### `POST /api/v1/models/download` (202 Accepted)

Create a new download task.

**Request:**
```json
{
  "source_type": "huggingface",
  "source_identifier": "mistralai/Mistral-7B-v0.1",
  "revision": "main",
  "file_patterns": ["*.bin", "*.safetensors"],
  "hf_token": "optional_private_token",
  "priority": 1,
  "tags": ["llm", "7b"]
}
```

**Response (202):**
```json
{
  "task_id": "dl_a1b2c3d4e5...",
  "status": "PENDING",
  "created_at": "2024-01-15T10:30:00Z",
  "poll_url": "/api/v1/tasks/dl_xxx",
  "estimated_size_bytes": null
}
```

#### `GET /api/v1/tasks/{task_id}`

Get task status and progress.

**Response:**
```json
{
  "task_id": "dl_xxx",
  "status": "DOWNLOADING",
  "progress_pct": 45,
  "downloaded_bytes": 2147483648,
  "total_bytes": 4831838208,
  "eta_seconds": 3600,
  "current_file": "model.safetensors",
  "model_id": "550e8400-e29b-41d4-a716-446655440000",
  "error_code": null,
  "error_message": null,
  "retry_count": 0,
  "max_retries": 3,
  "created_at": "2024-01-15T10:30:00Z",
  "started_at": "2024-01-15T10:30:05Z"
}
```

#### `POST /api/v1/tasks/{task_id}/retry` (202)

Retry a failed task (if retries remaining).

#### `GET /api/v1/tasks` (list)

List all tasks with filtering:
- `skip`: pagination offset
- `limit`: items per page
- `status`: filter by status (PENDING, DOWNLOADING, COMPLETED, FAILED)

### Model Endpoints

#### `GET /api/v1/models` (list)

List all downloaded models:
- `skip`, `limit`: pagination
- `status`: filter by status (ready, corrupt, deleted)
- `tags`: comma-separated tags

#### `GET /api/v1/models/{model_id}`

Get model details including metadata.

#### `DELETE /api/v1/models/{model_id}`

Delete a model:
```json
{
  "delete_files": true
}
```

### Health

#### `GET /api/v1/health`

Returns:
```json
{
  "status": "ok",
  "checks": {
    "postgres": "ok",
    "redis": "ok",
    "disk_usage_pct": 42.5,
    "disk_free_gb": 150.3
  }
}
```

## Download Sources

### HuggingFace

```json
{
  "source_type": "huggingface",
  "source_identifier": "mistralai/Mistral-7B-v0.1",
  "revision": "main",
  "file_patterns": ["*.safetensors"],
  "hf_token": "hf_xxx"
}
```

### GitHub Release

```json
{
  "source_type": "github_release",
  "source_identifier": "ggerganov/llama.cpp/v1.0.0",
  "file_patterns": ["*.bin"]
}
```

### Direct URL

```json
{
  "source_type": "direct_url",
  "source_identifier": "https://example.com/models/model.bin"
}
```

## Configuration

See `.env.example` for all settings. Key variables:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db

# Storage
STORAGE_BASE_PATH=/data/models
TEMP_DOWNLOAD_PATH=/tmp/model_downloads
MIN_FREE_DISK_GB=5.0

# Download
CHUNK_SIZE_BYTES=8388608
MAX_RETRY_COUNT=3
CONNECT_TIMEOUT=30
READ_TIMEOUT=60

# Celery
CELERY_WORKER_CONCURRENCY=2
CELERY_MAX_MEMORY_PER_CHILD=2097152
```

## Error Handling

Standard error response format:
```json
{
  "error": {
    "code": "DISK_FULL",
    "message": "Insufficient disk space",
    "task_id": "dl_xxx",
    "retryable": false,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

Error codes:
- `DOWNLOAD_ERROR`: Generic download error
- `DISK_FULL`: Insufficient disk space (507)
- `CHECKSUM_MISMATCH`: SHA-256 verification failed
- `SOURCE_UNAVAILABLE`: Source not reachable (503)
- `DUPLICATE_MODEL`: Model already exists (409)
- `TASK_NOT_RETRYABLE`: Cannot retry task (422)
- `INVALID_CONFIG`: Configuration error (500)

## Development

### Running Tests

```bash
pytest tests/ -v
pytest tests/unit/ -v --cov=app
```

### Linting & Formatting

```bash
black app/
isort app/
flake8 app/
mypy app/
```

### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Monitoring

- API logs: docker-compose logs api
- Worker logs: docker-compose logs worker
- Database: Connect to postgres:5432
- Redis: redis-cli at localhost:6379

## Production Deployment

1. Set strong passwords in `.env` (change `ChangeThisInProd_*`)
2. Update database credentials and URLs
3. Use `docker-compose.prod.yml` with production settings
4. Configure proper CORS origins
5. Set `DEBUG=false`
6. Use proper HTTPS certificates
7. Configure persistent volumes with backup

## Known Limitations

- Single-file downloads (multi-file support can be added)
- Resume requires server HTTP Range support
- In-memory progress caching (Redis TTL 1 hour)
- Sequential file downloads per task

## License

MIT
