# NeuralSpace

**NeuralSpace** là nền tảng quản trị MLOps và dữ liệu (MLOps and data control plane), giúp quản lý vòng đời huấn luyện mô hình Machine Learning, kiểm soát phiên bản dữ liệu, theo dõi thực nghiệm và tích hợp với các môi trường tính toán đám mây như Google Colab.

---

## 🎯 Các tính năng chính

- **Quản lý Workspaces**: Dễ dàng tạo và quản lý môi trường làm việc kết nối với Google Colab một cách an toàn và bảo mật.
- **Quản lý Dữ liệu (Datasets)**: Quản lý version dữ liệu tích hợp DVC (Data Version Control) đảm bảo khả năng tái tạo cho từng mô hình.
- **Theo dõi Thực nghiệm (Experiments & Runs)**: Ghi log siêu tham số (hyperparameters), độ đo (metrics) và lưu trữ mã nguồn cho mỗi lần huấn luyện.
- **Quản lý Mô hình (Model Registry)**: Đăng ký, lưu trữ và theo dõi nguồn gốc (lineage) của các mô hình đã được huấn luyện.
- **Quy trình Phê duyệt (Approval Flow)**: Kiểm duyệt mô hình trước khi đưa lên môi trường Production.
- **Cấu hình Tích hợp**: Tích hợp Git (GitHub/GitLab) và hệ thống lưu trữ S3 (MinIO/AWS S3).

Để hiểu rõ hơn về các tính năng và cách sử dụng hệ thống, vui lòng tham khảo chi tiết tại **[Hướng dẫn sử dụng (USER_GUIDE.md)](docs/USER_GUIDE.md)**.

---

## 🏗 Cấu trúc dự án

Dự án được chia thành các thành phần chính sau:

- `frontend/`: Ứng dụng web giao diện người dùng (Xây dựng với **Next.js 14**, **React 18**, **Tailwind CSS**, **Zustand**).
- `backend/`: API Server và Logic điều khiển trung tâm (Xây dựng với **FastAPI**, **PostgreSQL**, **Redis**, **SQLAlchemy**).
- `docs/`: Các tài liệu hướng dẫn sử dụng và tài liệu thiết kế hệ thống.
- `scripts/`: Các script hỗ trợ triển khai, seed dữ liệu hoặc tiện ích hệ thống.
- `.github/`: Các Github Actions Workflows hỗ trợ CI/CD.

---

## 🛠 Công nghệ sử dụng

### 1. Frontend
- **Core Framework:** Next.js 14, React 18
- **Styling & UI:** Tailwind CSS, Framer Motion (cho animation), Recharts (vẽ biểu đồ)
- **Quản lý State & Data Fetching:** Zustand, TanStack React Query, Axios
- **Form & Validation:** React Hook Form, Zod

### 2. Backend
- **Core Framework:** FastAPI (Python 3.10+)
- **Database & ORM:** PostgreSQL 16, SQLAlchemy, Alembic (quản lý migration)
- **Caching & Background Tasks:** Redis 7
- **Bảo mật & Xác thực:** Pydantic (data validation), JWT tokens

### 3. Cấu trúc hạ tầng & Tích hợp (Infrastructure & Integrations)
- **Môi trường chạy mô hình (Runtime):** Google Colab (kết nối qua Claim Code an toàn)
- **Lưu trữ dữ liệu/mô hình (Object Storage):** MinIO hoặc AWS S3
- **Quản lý phiên bản dữ liệu:** DVC (Data Version Control)
- **Containerization:** Docker & Docker Compose

---

## 🚀 Hướng dẫn cài đặt và khởi chạy

Do hệ thống bao gồm hai thành phần độc lập là Backend và Frontend, bạn cần cài đặt và khởi chạy riêng biệt (hoặc sử dụng Docker Compose nếu được cung cấp).

### 1. Backend (FastAPI)

Yêu cầu: Python 3.10+, PostgreSQL 16, Redis 7, Docker & Docker Compose.

```bash
cd backend
cp .env.example .env

# Khởi chạy các service phụ thuộc (Postgres, Redis)
docker-compose up -d

# Cài đặt thư viện và chạy server dev
pip install -e .
alembic upgrade head
uvicorn app.main:app --reload
```
*Tham khảo chi tiết tại: [backend/README.md](backend/README.md)*

### 2. Frontend (Next.js)

Yêu cầu: Node.js 18+ (khuyên dùng 20+)

```bash
cd frontend
cp .env.local.example .env.local

# Cài đặt thư viện
npm install

# Khởi chạy server dev
npm run dev
```
Truy cập ứng dụng tại địa chỉ: `http://localhost:3000`

---

## 📚 Tài liệu tham khảo

- [Hướng dẫn sử dụng nền tảng (User Guide)](docs/USER_GUIDE.md)
- [Tài liệu kiến trúc tích hợp Google Colab](backend/docs/COLAB_EXTERNAL_RUNTIME_ARCHITECTURE.md)
- [Hướng dẫn tích hợp Frontend](frontend/FINAL_INTEGRATION_GUIDE.md)

---
*Thuộc dự án PhucNguyen2904/CollabClone*
