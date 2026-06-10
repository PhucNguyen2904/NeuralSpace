# NeuralSpace Control Plane - Backend

FastAPI-based MLOps and data control plane. Google Colab is the target external
compute runtime; the existing Kubernetes/Jupyter workspace runtime is a legacy
migration path.

Target architecture and migration boundaries:

- [Google Colab External Runtime Architecture](docs/COLAB_EXTERNAL_RUNTIME_ARCHITECTURE.md)

## Project Structure

```
backend/
├── app/                          # Main application package
│   ├── __init__.py
│   ├── main.py                   # FastAPI app entrypoint
│   ├── config.py                 # Pydantic Settings configuration
│   ├── dependencies.py           # FastAPI dependency injection
│   │
│   ├── core/                     # Core utilities
│   │   ├── exceptions.py         # Custom exceptions
│   │   ├── security.py           # JWT and token utilities
│   │   └── logging.py            # Structured logging
│   │
│   ├── api/v1/                   # API v1 endpoints
│   │   ├── router.py             # Router collection
│   │   └── health_router.py      # Health check endpoints
│   │
│   ├── models/                   # SQLAlchemy ORM models
│   ├── schemas/                  # Pydantic request/response schemas
│   └── services/                 # Business logic layer
│
├── alembic/                      # Database migrations
│   ├── env.py
│   └── versions/                 # Migration scripts
│
├── tests/                        # Test suite
│   ├── conftest.py               # Pytest configuration
│   └── test_health.py            # Health check tests
│
├── Dockerfile                    # Container image definition
├── docker-compose.yml            # Local development stack
├── pyproject.toml                # Project metadata and dependencies
├── alembic.ini                   # Alembic configuration
├── .env.example                  # Environment template
└── README.md                     # This file
```

## Setup

### Prerequisites

- Python 3.10+
- Docker & Docker Compose
- PostgreSQL 16
- Redis 7

### Local Development

1. **Install dependencies:**

```bash
pip install -e .
```

2. **Copy environment file:**

```bash
cp .env.example .env
```

3. **Start services with Docker Compose:**

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- FastAPI API (port 8000)

4. **Run migrations (when needed):**

```bash
alembic upgrade head
```

5. **Access the API:**

- API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs
- API Docs (ReDoc): http://localhost:8000/redoc
- Health Check: http://localhost:8000/health

### Testing

Run tests:

```bash
pytest
```

Run tests with coverage:

```bash
pytest --cov=app
```

Run specific test:

```bash
pytest tests/test_health.py::test_health_check
```

## Configuration

Configuration is managed via Pydantic Settings in `app/config.py`. Settings are loaded from:

1. Environment variables
2. `.env` file

Key settings:

- `ENVIRONMENT`: development/staging/production
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `SECRET_KEY`: JWT signing key (min 32 chars)
- `KUBERNETES_IN_CLUSTER`: Run in Kubernetes cluster
- `JUPYTER_BASE_IMAGE`: Base Docker image for Jupyter
- `MINIO_*`: MinIO S3 configuration
- `MAX_WORKSPACES_PER_USER`: Workspace quota per user
- `IDLE_TIMEOUT_SECONDS`: Workspace idle timeout
- `COLAB_TEMPLATE_ORGANIZATION`, `COLAB_TEMPLATE_REPOSITORY`: Public GitHub template repository
- `COLAB_TEMPLATE_REF`: Pinned commit SHA or release tag
- `COLAB_TEMPLATE_NOTEBOOK_PATH`: Public bootstrap notebook path
- `COLAB_CLAIM_EXPIRE_SECONDS`: One-time claim TTL in seconds
- `COLAB_DATA_URL_EXPIRE_SECONDS`: Signed dataset URL TTL in seconds

## Google Colab Integration

Colab opens a public, pinned notebook URL with no credentials or private
identifiers in the URL. Users paste a short-lived one-time claim into the
notebook to obtain a scoped runtime session.

### Endpoints

- `POST /api/v1/colab/workspaces/{workspace_id}/claims`
  - Requires bearer auth
  - Validates workspace ownership
  - Returns a one-time claim and secret-free public Colab URL
- `POST /api/v1/colab/claims/exchange`
  - Atomically consumes the claim
  - Returns a scoped runtime token and short-lived dataset grants

### Quick setup

1. Push template notebook to GitHub:
   - `notebooks/bootstrap.ipynb`
2. Set env:
   - `COLAB_TEMPLATE_ORGANIZATION=neuralspace-ai`
   - `COLAB_TEMPLATE_REPOSITORY=colab-templates`
   - `COLAB_TEMPLATE_REF=<commit-sha-or-release-tag>`
3. Restart API service.
4. In Colab notebook, set:
   - `API_BASE=https://<your-api-domain>/api/v1`

## Architecture

### Security

- JWT tokens for API authentication (`app/core/security.py`)
- Workspace tokens for notebook access
- Token hashing with SHA-256 for database storage

### Logging

- Structured JSON logging with structlog
- Request ID tracking across logs
- Environment-specific formatting (pretty console for dev, JSON for prod)

### Dependencies Injection

- SQLAlchemy async sessions (`get_db`)
- Redis clients (`get_redis`)
- User authentication (`get_current_user`)
- Role-based access control (`require_role`)

### Error Handling

Custom exceptions for domain errors:
- `WorkspaceNotFoundError` (404)
- `WorkspaceNotOwnedError` (403)
- `QuotaExceededError` (429)
- `WorkspaceNotRunningError` (409)
- `ProvisioningError` (500)

## API Endpoints

### Health Check

```
GET /health
GET /api/v1/health
```

Response:
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

## Next Steps

Following prompts will implement:

1. **Prompt 02**: Database models and migration setup
2. **Prompt 03**: User and authentication endpoints
3. **Prompt 04**: Workspace management API
4. **Prompt 05**: Jupyter integration and notebook execution
5. **Prompt 06**: Observability and deployment hardening

## Deployment

### Production

1. Set `ENVIRONMENT=production`
2. Update `SECRET_KEY` to a secure random value (min 32 chars)
3. Configure `DATABASE_URL` to managed PostgreSQL
4. Configure `REDIS_URL` to managed Redis
5. Set `KUBERNETES_IN_CLUSTER=true` for K8s deployment
6. Build image: `docker build -t cloud-ide-platform:1.0.0 .`
7. Push to registry and deploy

## Development Commands

```bash
# Run API server
uvicorn app.main:app --reload

# Generate migration
alembic revision --autogenerate -m "Description"

# Run migration
alembic upgrade head

# Downgrade migration
alembic downgrade -1

# Format code
black app tests

# Lint code
flake8 app tests

# Type check
mypy app
```

## License

MIT
