# Hướng dẫn cấu hình Cơ sở dữ liệu (Database Setup Guide)

Hệ thống NeuralSpace sử dụng **PostgreSQL (phiên bản 16)** làm cơ sở dữ liệu quan hệ chính để lưu trữ thông tin về người dùng, workspace, dataset, model, tracking, và các cấu hình tích hợp.

Dưới đây là hướng dẫn chi tiết cách cấu hình, khởi tạo và quản lý cơ sở dữ liệu cho dự án.

---

## 1. Cấu hình biến môi trường (Environment Variables)

Thông tin kết nối cơ sở dữ liệu được cấu hình qua các biến môi trường trong file `.env` ở thư mục `backend/`.

### Các biến cấu hình chính:
*   `DATABASE_URL`: URL kết nối cho API server chính. Dự án sử dụng SQLAlchemy và thư viện bất đồng bộ `asyncpg`, do đó URL kết nối phải sử dụng schema `postgresql+asyncpg`.
*   `POSTGRES_USER`: Tên tài khoản quản trị (mặc định: `postgres`).
*   `POSTGRES_PASSWORD`: Mật khẩu tài khoản (mặc định: `postgres`).
*   `POSTGRES_DB`: Tên cơ sở dữ liệu chính (mặc định: `cloud_ide`).

### Ví dụ cấu hình trong `.env`:
```env
# Cho môi trường Local Development (ngoài Docker kết nối vào container DB)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/cloud_ide

# Mật khẩu quản trị PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=cloud_ide
```

> [!WARNING]
> Khi deploy lên Production hoặc Staging, bạn **bắt buộc** phải thay đổi `POSTGRES_USER`, `POSTGRES_PASSWORD` và tạo một mật khẩu phức tạp để bảo mật dữ liệu.

---

## 2. Khởi tạo Cơ sở dữ liệu

Khi bạn khởi động hệ thống qua Docker Compose, container `postgres` sẽ được dựng lên và tự động khởi tạo cơ sở dữ liệu trống `cloud_ide` dựa trên các biến cấu hình.

### Khởi tạo Schema và Dữ liệu mẫu (Seed Data)
Có hai cách để khởi tạo cấu trúc bảng (schema) và dữ liệu thử nghiệm:

#### Cách 1: Sử dụng Docker Compose (Tự động)
Khi container `postgres` khởi động lần đầu, nó sẽ tự động nạp cấu trúc database từ:
*   `backend/scripts/schema.sql` (Schema ban đầu)
*   `backend/scripts/seed.sql` (Dữ liệu mẫu cho người dùng, workspace)

#### Cách 2: Chạy Alembic Migrations (Khuyến nghị cho Development)
Nếu bạn đang phát triển dự án và chỉnh sửa model, hãy sử dụng **Alembic** để đồng bộ cấu trúc database.

1.  Kích hoạt môi trường ảo Python và di chuyển vào thư mục `backend`:
    ```bash
    cd backend
    # Kích hoạt venv (Windows)
    .venv\Scripts\activate
    # Hoặc (Linux/macOS)
    source .venv/bin/activate
    ```
2.  Chạy lệnh cập nhật database lên phiên bản mới nhất:
    ```bash
    alembic upgrade head
    ```
    Hoặc sử dụng `Makefile`:
    ```bash
    make migrate
    ```

---

## 3. Quản lý Migrations bằng Alembic

Alembic giúp quản lý các thay đổi về cấu trúc cơ sở dữ liệu (thêm bảng, sửa cột, xóa index) dưới dạng các file phiên bản (versions) nằm trong thư mục `backend/alembic/versions/`.

### Tạo một migration mới khi thay đổi Model
Khi bạn thêm mới hoặc sửa đổi các class model trong `backend/app/models/`, hãy chạy lệnh sau để Alembic tự động phát hiện và sinh file migration:

```bash
alembic revision --autogenerate -m "mô_tả_ngắn_gọn_thay_đổi"
```

*Ví dụ:*
```bash
alembic revision --autogenerate -m "add_git_integration"
```

Alembic sẽ tạo ra một file `.py` mới trong `backend/alembic/versions/`. Bạn nên mở file này ra kiểm tra lại để đảm bảo nó sinh mã chính xác trước khi apply.

### Áp dụng migration (Upgrade)
```bash
alembic upgrade head
```

### Quay lui migration (Downgrade)
Nếu muốn hủy bỏ thay đổi gần nhất:
```bash
alembic downgrade -1
```
Hoặc quay về trạng thái ban đầu (xóa sạch bảng):
```bash
alembic downgrade base
```

---

## 4. Kết nối và Truy vấn Database trực tiếp

Bạn có thể sử dụng các công cụ quản lý cơ sở dữ liệu trực quan như **DBeaver**, **pgAdmin**, hoặc **TablePlus** để kết nối trực tiếp vào DB đang chạy trong Docker container.

### Thông tin kết nối (Connection Details):
*   **Host**: `localhost` (hoặc IP của server nếu deploy từ xa)
*   **Port**: `5432`
*   **Database**: `cloud_ide`
*   **Username**: `postgres`
*   **Password**: `postgres` (hoặc mật khẩu bạn đã cấu hình trong `.env`)

---

## 5. Xử lý sự cố thường gặp (Troubleshooting)

### Lỗi: `driver/library not found (asyncpg)`
*   **Nguyên nhân**: Thư viện `asyncpg` chưa được cài đặt trong môi trường Python hiện tại của bạn.
*   **Khắc phục**: Chạy lệnh `pip install asyncpg` hoặc cài đặt toàn bộ project dependencies bằng `pip install -e .` trong thư mục `backend`.

### Lỗi: `Connection refused` hoặc không thể kết nối tới Host
*   **Nguyên nhân**: Container database chưa khởi động hoặc port `5432` đang bị chiếm bởi một tiến trình PostgreSQL khác cài trên máy local của bạn.
*   **Khắc phục**:
    1.  Chạy `docker compose ps` để kiểm tra trạng thái container `cloud-ide-postgres`.
    2.  Nếu port `5432` bị trùng, bạn có thể đổi port map bên ngoài trong `docker-compose.yml` (ví dụ: `5433:5432`) và cập nhật lại `DATABASE_URL` trong `.env` thành `localhost:5433`.

---

*➡ Tiếp theo: Hãy chuyển sang **[03-backend-setup.md](file:///d:/Documents/Lap_trinh/NeuralSpace/docs/setup/03-backend-setup.md)** để khởi động các dịch vụ backend.*
