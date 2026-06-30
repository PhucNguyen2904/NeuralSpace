# NeuralSpace (MLOps & Data Control Plane)

NeuralSpace is a modern MLOps platform designed to provide a unified control plane for machine learning workflows. It features seamless integration with Google Colab, robust dataset versioning via DVC, model tracking via MLflow, and comprehensive lineage traceability.

## 🚀 Key Features

- **Workspace Management**: Launch secure, token-based computational environments integrated with Google Colab. Avoid vendor lock-in by executing workloads in external runtimes with full access to the control plane.
- **Dataset Versioning**: First-class support for dataset versioning powered by Data Version Control (DVC) and MinIO object storage. Supports computer vision tasks (YOLO format, Object Detection) and tabular data.
- **Model Registry & Tracking**: Built-in integration with MLflow for experiment tracking, model registry, and lifecycle management.
- **Lineage Traceability**: Bidirectional traceability mapping datasets to experiments and models, enabling full visibility into the AI lifecycle.

## 🏗 Architecture & Tech Stack

### Frontend (`/frontend`)
- **Framework**: Next.js (App Router) with React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State/Data Fetching**: React Query
- **Icons**: Lucide React

### Backend (`/backend`)
- **Framework**: FastAPI (Python 3.10+)
- **Database**: PostgreSQL 16 (using SQLAlchemy ORM)
- **Caching & Async**: Redis 7
- **Storage**: MinIO (S3-compatible object storage)
- **MLOps Integrations**: MLflow (tracking server) & DVC (data versioning)

## 📁 Project Structure

```text
NeuralSpace/
├── backend/                  # FastAPI application
│   ├── app/                  # Main backend source code (routers, services, models)
│   ├── tests/                # Pytest suites
│   ├── alembic/              # Database migration scripts (legacy/reference)
│   ├── docker-compose.yml    # Docker services definition
│   └── scripts/              # DB initialization (schema.sql, seed.sql)
│
├── frontend/                 # Next.js web application
│   ├── src/app/              # Next.js App Router pages
│   ├── src/components/       # Reusable React components & UI elements
│   ├── src/lib/              # Utilities, hooks, and API clients
│   └── src/types/            # TypeScript definitions
│
├── docs/                     # Architecture & design documentation
└── README.md                 # This file
```

## 🛠 Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ & npm
- Python 3.10+ (for local backend development)

### 1. Start the Backend Infrastructure

The backend uses Docker Compose to orchestrate PostgreSQL, Redis, MinIO, MLflow, and the FastAPI backend.

```bash
cd backend
# Copy the environment template
cp .env.example .env

# Start all services (Backend, DB, Redis, MinIO, MLflow)
docker compose up -d
```
*Note: The PostgreSQL database is automatically initialized with the correct schema and seed data on first boot via `scripts/schema.sql` and `scripts/seed.sql`.*

### 2. Start the Frontend Application

```bash
cd frontend
# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at [http://localhost:3000](http://localhost:3000).

## 📡 Core API Services

- **API Base**: `http://localhost:8000/api/v1`
- **Swagger Docs**: `http://localhost:8000/docs`
- **Services Include**:
  - `/workspaces`: Workspace provisioning and token claims.
  - `/datasets`: Dataset metadata, DVC tracking, and version history.
  - `/lineage`: Lineage graph generation.
  - `/colab`: Specialized endpoints for external runtime integrations.

## 🔐 Security & Auth

NeuralSpace uses a secure JWT-based authentication system. External computational runtimes (like Colab) receive a short-lived "claim token" which is exchanged for a scoped runtime session, ensuring that private identifiers and raw credentials never leak into the notebook environment.

## 📄 License

MIT License.
