# CollabClone: ML Model Download & Management Platform

A high-performance, asynchronous machine learning model download and collaborative management platform. This repository is structured as a monorepo containing a high-speed Python/FastAPI backend and a sleek Next.js frontend.

---

## 📂 Repository Structure

- **[`/backend`](file:///d:/Documents/Lap%20trinh/CollabClone/backend)**: Async Python backend powered by FastAPI, Celery, Redis, and PostgreSQL. Handles high-speed downloads from HuggingFace, GitHub, or direct URLs.
- **[`/frontend`](file:///d:/Documents/Lap%20trinh/CollabClone/frontend)**: Next.js/React web dashboard offering real-time download status, workspace control, and system resources visualization.
- **[`/stitch_ai_model_management_platform`](file:///d:/Documents/Lap%20trinh/CollabClone/stitch_ai_model_management_platform)**: Design briefs, system architecture details, and UI/UX flows.

---

## ⚡ Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### 2. Setting Up the Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Copy the environment variables template and configure them:
   ```bash
   cp .env.example .env
   ```
3. Start the services using Docker Compose:
   ```bash
   docker-compose up --build
   ```
   This will spin up:
   - FastAPI Server (`http://localhost:8000`)
   - Celery Worker & Beat scheduler
   - Redis Broker & Cache
   - PostgreSQL Database

### 3. Setting Up the Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the user interface at `http://localhost:3000`.

---

## 🔧 Core Features

- **Multi-Source Downloads**: Seamless support for HuggingFace repositories, GitHub Releases, and direct HTTP/HTTPS URLs.
- **Async Execution**: Powered by Celery for reliable background model downloads without blocking web servers.
- **Robust Failure Recovery**: Resumable downloads using HTTP Range headers, verification via SHA-256, and automated worker retries.
- **System Monitoring**: Live real-time resource tracking (CPU, GPU, RAM, Disk Space) built into a modern glassmorphic dashboard.

---

## 📄 License

This project is licensed under the MIT License.
