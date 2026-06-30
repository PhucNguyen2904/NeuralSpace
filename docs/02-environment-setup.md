# 02 - Thiết lập biến môi trường (Environment Setup)

Dự án NeuralSpace yêu cầu các tệp `.env` để cấu hình thông tin bảo mật, database và kết nối.

## Cấu hình Backend

Di chuyển vào thư mục `backend` và copy template file biến môi trường:

```bash
cd backend
cp .env.example .env
```

Mở file `.env` vừa tạo và cập nhật các thông số (nếu cần). Các thông số mặc định trong `.env.example` thường đã được thiết lập sẵn để có thể chạy ngay trên môi trường local (development):

```env
# app/core/config.py
ENVIRONMENT=development
SECRET_KEY=supersecretkey-change-me-in-production

# PostgreSQL
DATABASE_URL=postgresql+asyncpg://postgres:postgres@cloud-ide-postgres:5432/cloud_ide

# Redis
REDIS_URL=redis://cloud-ide-redis:6379/0

# MinIO (Object Storage)
MINIO_ENDPOINT=cloud-ide-minio:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
```

> [!WARNING]
> Nếu bạn định deploy dự án lên môi trường production, hãy đảm bảo thay đổi `SECRET_KEY` và các password mặc định.

## Cấu hình Frontend

Thư mục `frontend` không cần thiết phải cấu hình `.env` phức tạp nếu bạn chỉ chạy kết nối với backend ở `localhost:8000`. Next.js sẽ được cấu hình proxy hoặc gọi thẳng API thông qua route `http://localhost:8000/api/v1`.

Tuy nhiên, nếu cần thiết lập biến môi trường đặc biệt, hãy tạo file `.env.local` ở bên trong folder `frontend`.

---
*➡ Tiếp theo: Hãy chuyển sang **03-backend-setup.md** để khởi động các dịch vụ backend.*
