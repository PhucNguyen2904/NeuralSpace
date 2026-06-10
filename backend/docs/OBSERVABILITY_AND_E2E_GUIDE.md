# Observability And E2E Guide

## 1. Scope

Tài liệu này mô tả phần tích hợp cuối:

- Monitoring endpoints (`/api/v1/health`, `/api/v1/health/ready`, `/api/v1/metrics`)
- Prometheus metrics cho workspace lifecycle và API latency
- OpenTelemetry tracing export qua OTLP gRPC (Jaeger-compatible)
- Integration tests end-to-end cho workspace lifecycle/quota/GC
- Docker Compose test stack và Makefile commands


## 2. Implemented Files

- `app/api/v1/monitoring/router.py`
- `app/core/metrics.py`
- `app/core/tracing.py`
- `app/main.py`
- `app/dependencies.py`
- `app/services/workspace_service.py`
- `tests/integration/test_full_workspace_lifecycle.py`
- `docker-compose.test.yml`
- `Makefile`
- `pyproject.toml` (dependencies + pytest marker)


## 3. Monitoring Endpoints

### 3.1 Liveness

- `GET /api/v1/health`
- Mục tiêu: xác nhận process API đang sống.
- Kết quả: HTTP 200 + `{"status":"ok","version":"..."}`

### 3.2 Readiness

- `GET /api/v1/health/ready`
- Mục tiêu: xác nhận API đã sẵn sàng phục vụ traffic.
- Kiểm tra:
  - DB (`SELECT 1`)
  - Redis (`PING`)
  - Kubernetes connectivity (`list_workspace_namespaces`)
- Kết quả:
  - `ready`: tất cả check pass
  - `not_ready`: ít nhất 1 check fail

### 3.3 Metrics

- `GET /api/v1/metrics`
- Output: Prometheus text format.


## 4. Metrics Catalog

### 4.1 Workspace

- `workspace_created_total{tier,status}` (Counter)
  - `accepted`: workspace create accepted
  - `running`: provisioning thành công, workspace chuyển RUNNING
  - `error`: provisioning fail

- `workspace_active_gauge{tier}` (Gauge)
  - Tăng khi workspace chạy thành công
  - Giảm khi stop request được xử lý

- `workspace_provisioning_duration_seconds` (Histogram)
  - Đo thời gian provisioning từ lúc tạo workspace tới RUNNING

- `workspace_idle_kill_total` (Counter)
  - Tăng khi GC xác nhận kill idle workspace

### 4.2 API

- `api_request_duration_seconds{endpoint,method}` (Histogram)
  - Được đo ở middleware HTTP cho toàn bộ request


## 5. Tracing (OpenTelemetry)

### 5.1 Instrumented Components

- FastAPI
- SQLAlchemy
- Redis
- httpx

### 5.2 Export

- Exporter: OTLP gRPC
- Endpoint: đọc từ env `OTEL_EXPORTER_OTLP_ENDPOINT`
- Service name: `OTEL_SERVICE_NAME` (default `cloud-ide-api`)

### 5.3 Trace Context Propagation

- Hệ thống nhận và trả lại `X-Trace-ID` header.
- Đồng thời vẫn giữ chuẩn W3C trace context trong OpenTelemetry.

### 5.4 Example env

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger-collector:4317
OTEL_SERVICE_NAME=cloud-ide-api
```


## 6. Integration Tests

File: `tests/integration/test_full_workspace_lifecycle.py`

### 6.1 `test_create_run_stop_workspace`

Luồng:

1. `POST /workspaces` -> `202`
2. Poll status -> `RUNNING` (K8s mocked)
3. `POST /heartbeat` -> gia hạn timeout
4. `POST /stop` -> `202`
5. Poll -> `STOPPING/STOPPED`
6. Verify events: `START_REQUESTED`, `RUNNING`, `STOPPED`

### 6.2 `test_quota_enforcement`

1. Tạo workspace 1 -> success
2. Tạo workspace 2 -> success
3. Tạo workspace 3 -> `429`

### 6.3 `test_gc_kills_idle_workspace`

1. Seed workspace RUNNING với `auto_kill_at` đã quá hạn
2. Run GC task trực tiếp
3. Verify workspace chuyển `STOPPED`


## 7. Test Environment (docker-compose.test.yml)

Services:

- `postgres-test` (DB riêng)
- `redis-test`
- `k8s-mock` (fake API server)
- `api-test`


## 8. Runbook

### 8.1 Local dev

```bash
make dev
```

### 8.2 Unit tests

```bash
make test
```

### 8.3 Integration tests

```bash
docker compose -f docker-compose.test.yml up -d
make test-int
```

### 8.4 Migrations

```bash
make migrate
```

### 8.5 Lint

```bash
make lint
```

### 8.6 Build images

```bash
make build
```


## 9. Deployment Order

1. Database
2. Redis
3. API
4. Proxy


## 10. Common Pitfalls And Debug

### 10.1 `/health/ready` trả `not_ready` vì k8s

- Kiểm tra `KUBERNETES_IN_CLUSTER`
- Kiểm tra kubeconfig / service account RBAC
- Kiểm tra network reachability tới API server

### 10.2 Không thấy metrics mới

- Confirm traffic đã đi qua flow tương ứng
- Gọi lại `/api/v1/metrics` và grep metric name

### 10.3 Trace không xuất hiện ở Jaeger

- Xác nhận `OTEL_EXPORTER_OTLP_ENDPOINT`
- Xác nhận Jaeger collector bật cổng gRPC `4317`
- Xem log API startup có dòng `Tracing initialized`

### 10.4 Integration test fail do FK `users.id`

- Seed user trước create workspace (test fixture đã xử lý)
