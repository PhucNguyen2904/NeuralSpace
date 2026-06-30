# 01 - Yêu cầu hệ thống & Môi trường (Prerequisites)

Trước khi tiến hành cài đặt NeuralSpace, hệ thống của bạn cần đáp ứng các yêu cầu tối thiểu sau đây:

## 1. Yêu cầu phần cứng
- **CPU**: Tối thiểu 4 cores (Khuyến nghị 8 cores).
- **RAM**: Tối thiểu 8 GB (Khuyến nghị 16 GB để chạy mượt Docker).
- **Ổ cứng (Storage)**: Tối thiểu 20 GB dung lượng trống để lưu trữ container, database và object storage (MinIO).

## 2. Phần mềm cần thiết

Hãy đảm bảo bạn đã cài đặt các công cụ sau trước khi bắt đầu:

### Docker & Docker Compose
Hệ thống sử dụng Docker để chạy backend, database và các dịch vụ phụ trợ (Redis, MinIO, MLflow).
- Tải và cài đặt [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) hoặc Docker Engine (Linux).
- Đảm bảo `docker` và `docker compose` (hoặc `docker-compose`) hoạt động thông qua command line:
  ```bash
  docker --version
  docker compose version
  ```

### Node.js & npm (Dành cho Frontend)
Ứng dụng frontend được viết bằng Next.js.
- Cài đặt **Node.js phiên bản 18** trở lên. Khuyến nghị tải bản LTS từ [Node.js Official](https://nodejs.org/).
- Kiểm tra lại bằng lệnh:
  ```bash
  node -v
  npm -v
  ```

### Git
- [Git](https://git-scm.com/downloads) để clone và quản lý mã nguồn.

### Python 3.10+ (Tuỳ chọn cho Development Backend)
Nếu bạn chỉ chạy backend bằng Docker thì không bắt buộc. Tuy nhiên, nếu bạn muốn phát triển hoặc chạy API server ngoài Docker, hãy cài đặt Python 3.10+.
```bash
python --version
```

---
*➡ Tiếp theo: Hãy chuyển sang **02-environment-setup.md** để thiết lập biến môi trường.*
