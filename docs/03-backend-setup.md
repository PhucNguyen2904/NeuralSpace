# 03 - Cài đặt Backend (Docker Services)

Phần lớn hạ tầng backend (Database, Cache, MinIO, MLflow) và API server đã được cấu hình trọn gói trong Docker Compose. Bạn chỉ cần chạy lệnh là toàn bộ hệ thống sẽ tự động khởi động.

## Khởi động Services

1. Mở Terminal / Command Prompt và đi tới thư mục `backend`:
   ```bash
   cd backend
   ```

2. Chạy lệnh sau để build và khởi động toàn bộ container chạy ngầm (`-d`):
   ```bash
   docker compose up -d --build
   ```

3. (Tuỳ chọn) Theo dõi log của các container để đảm bảo hệ thống đã khởi động thành công:
   ```bash
   docker compose logs -f
   ```

## Quá trình khởi tạo (Initialization)

Khi các container khởi động lên lần đầu, một script chạy ngầm sẽ được kích hoạt để khởi tạo cơ sở dữ liệu (`cloud_ide`), tự động chạy các script:
- `backend/scripts/schema.sql`: Khởi tạo bảng và cấu trúc schema.
- `backend/scripts/seed.sql`: Đẩy một số dữ liệu giả lập (seed data) phục vụ cho quá trình test trên local.

Bạn không cần thao tác thêm lệnh `alembic` trừ phi bạn thay đổi code database.

## Các Services trong hệ thống:
- **FastAPI API**: http://localhost:8000
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`
- **MinIO S3**: `localhost:9000` (API) & `localhost:9001` (Console)
- **MLflow Tracking**: `localhost:5000`

---
*➡ Tiếp theo: Hãy chuyển sang **04-frontend-setup.md** để cài đặt giao diện web.*
