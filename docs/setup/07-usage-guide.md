# 05 - Hướng dẫn sử dụng & Kiểm tra

Chúc mừng! Nếu bạn đã đến được bước này, bạn đã cài đặt thành công NeuralSpace. Hãy kiểm tra các tính năng và chức năng của nền tảng qua các bước sau.

## 1. Đăng nhập vào Giao diện Web (UI)

1. Mở trình duyệt web của bạn và truy cập vào [http://localhost:3000](http://localhost:3000).
2. Khi cơ sở dữ liệu được khởi tạo, một tài khoản admin mặc định đã được tạo sẵn để bạn dùng thử. Hãy sử dụng thông tin sau để đăng nhập:
   - **Email**: `tester@collabclone.local`
   - **Password**: `Password123!`

## 2. Kiểm tra API Backend (Swagger Docs)

Backend (FastAPI) cung cấp giao diện Swagger UI giúp bạn xem tài liệu kỹ thuật và thử nghiệm API trực tiếp.
- Truy cập vào [http://localhost:8000/docs](http://localhost:8000/docs).
- Truy cập vào ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc).
- Kiểm tra Endpoint sức khoẻ (Health check): [http://localhost:8000/health](http://localhost:8000/health).

## 3. Khám phá Hệ thống

Sau khi vào được Dashboard chính, bạn có thể kiểm tra các chức năng nổi bật:
- **Datasets**: Vào menu Datasets để upload data (ảnh, CSV, YOLO format). Hệ thống sẽ tự động version dữ liệu với DVC.
- **Models**: Xem danh sách models. Các log models sẽ được theo dõi song song trên MLflow.
- **Lineage (Traceability)**: Tab Lineage cho phép xem đường đi của dữ liệu từ Dataset -> Model -> Experiment theo dạng sơ đồ khối.
- **Workspaces**: Tạo một Workspace sử dụng token xác thực. (Bạn có thể copy mã token để chạy tích hợp với Google Colab / Jupyter External).

## Xử lý lỗi thường gặp (Troubleshooting)

- **Lỗi cổng (Port in use)**: Hãy kiểm tra chắc chắn các port `8000` (FastAPI), `3000` (Frontend), `5432` (PostgreSQL), `6379` (Redis) và `5000` (MLflow) không bị ứng dụng khác chiếm dụng trên hệ điều hành của bạn.
- **Lỗi Docker Database**: Nếu container `cloud-ide-postgres` không khởi động được, hãy thử xoá database volume cũ đi và chạy lại: `docker compose down -v` sau đó `docker compose up -d`.

---
Cảm ơn bạn đã sử dụng **NeuralSpace**. Chúc bạn có một quá trình trải nghiệm tuyệt vời!
