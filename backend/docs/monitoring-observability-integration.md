# Monitoring, Observability, and Integration Guide

## 1. Monitoring API

### Endpoints

- `GET /api/v1/health`
  - Liveness check cơ bản.
  - Kỳ vọng: `200` + `{"status":"ok","version":"..."}`

- `GET /api/v1/health/ready`
  - Readiness check cho:
    - Database connectivity
    - Redis connectivity
    - Kubernetes API connectivity
  - Kỳ vọng:
    - `status=ready` khi toàn bộ check pass
    - `status=not_ready` khi ít nhất 1 check fail

- `GET /api/v1/metrics`
  - Prometheus scrape endpoint.
  - Trả về metrics text format.

### Metrics đang track

- `workspace_created_total{tier,status}` (Counter)
  - Track create accepted/running/error theo tier.

- `workspace_active_gauge{tier}` (Gauge)
  - Track số workspace active theo tier.

- `workspace_provisioning_duration_seconds` (Histogram)
  - Track thời gian provisioning workspace.

- `workspace_idle_kill_total` (Counter)
  - Track số workspace bị kill bởi idle GC.

- `api_request_duration_seconds{endpoint,method}` (Histogram)
  - Track latency API theo endpoint/method.

---

## 2. Tracing (OpenTelemetry)

### Scope instrumentation

- FastAPI
- SQLAlchemy
- Redis
- httpx

### Export

- OTLP gRPC exporter (phù hợp Jaeger qua OTLP collector).
- Bật qua env:
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - optional: `OTEL_SERVICE_NAME`

### Trace propagation

- Hỗ trợ trace context chuẩn.
- Propagate thêm `X-Trace-ID`:
  - đọc từ inbound request header
  - trả lại qua response header `X-Trace-ID`

---

## 3. Integration Tests

File: `tests/integration/test_full_workspace_lifecycle.py`

### Cases

1. `test_create_run_stop_workspace`
   - POST create workspace → `202`
   - Poll status → `RUNNING`
   - Heartbeat gia hạn `auto_kill_at`
   - Stop workspace → `202`
   - Poll → `STOPPING/STOPPED`
   - Assert events có `START_REQUESTED`, `RUNNING`, `STOPPED`

2. `test_quota_enforcement`
   - Tạo workspace 1 và 2 thành công
   - Workspace thứ 3 trả `429` (quota exceeded)

3. `test_gc_kills_idle_workspace`
   - Force `auto_kill_at` quá hạn
   - Chạy trực tiếp GC task
   - Assert workspace chuyển `STOPPED`

### Lưu ý test infra

- Yêu cầu Postgres + Redis chạy bằng `docker-compose.test.yml`.
- Kubernetes API được mock.

---

## 4. docker-compose.test.yml

Mục đích:

- Tách riêng test environment:
  - `postgres-test`
  - `redis-test`
  - `k8s-mock`
  - `api-test`

---

## 5. Makefile Targets

- `make dev` → `docker compose up --build`
- `make test` → chạy unit tests
- `make test-int` → chạy integration tests
- `make migrate` → `alembic upgrade head`
- `make lint` → `ruff` + `mypy`
- `make build` → build Docker images

---

## 6. System Validation Checklist

1. `alembic upgrade head` thành công.
2. `GET /api/v1/health` trả `ok`.
3. `GET /api/v1/health/ready` pass cả DB/Redis/K8s.
4. `GET /api/v1/metrics` scrape được.
5. Create workspace trả `202`.
6. Poll status lên `RUNNING`.
7. Heartbeat gia hạn `auto_kill_at`.
8. Stop workspace thành `STOPPING/STOPPED`.
9. `workspace_events` có đầy đủ lifecycle event chính.
10. Quota chặn workspace thứ 3 (`429`).
11. GC kill được workspace idle.
12. Trace xuất hiện trên Jaeger/collector.
13. Storage sync/restore không làm hỏng shutdown flow.
14. Proxy truy cập workspace ổn định sau restart.

---

## 7. Recommended Deploy Order

1. Database
2. Redis
3. API
4. Proxy

---

## 8. Common Pitfalls and Debug

1. `health/ready` fail ở K8s
   - Kiểm tra kubeconfig, RBAC, `KUBERNETES_IN_CLUSTER`.

2. Metrics không tăng
   - Gọi flow create/stop/GC rồi scrape lại `/metrics`.

3. Trace không xuất hiện
   - Kiểm tra `OTEL_EXPORTER_OTLP_ENDPOINT`, OTLP collector, network.

4. Integration test fail FK user
   - Đảm bảo seed user test trước khi tạo workspace.

5. Stop task lỗi khi không có K8s thật
   - Mock `KubernetesService` trong integration test/CI.

6. `/metrics` bị 401
   - Kiểm tra `AuthMiddleware.SKIP_PATHS`.
