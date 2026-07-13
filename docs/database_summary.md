# Database Schema Summary: NeuralSpace Platform

Tài liệu này cung cấp bản tóm tắt về cấu trúc cơ sở dữ liệu của nền tảng NeuralSpace, dựa trên nội dung của file schema.

## Phân vùng Schema (Schemas)
Cơ sở dữ liệu được chia thành hai schema chính:
- **`public`**: Chứa các bảng lõi về người dùng, workspace, và các cấu hình tích hợp (Git, Storage).
- **`mlops`**: Chứa các bảng chuyên biệt về Machine Learning Operations, như datasets, models, experiments, và runs.

---

## 1. Nền tảng lõi (Core Platform - `public` schema)

### Người dùng & Không gian làm việc (Users & Workspaces)
- **`users`**: Quản lý tài khoản người dùng (id, email, tên, mật khẩu).
- **`workspaces`**: Không gian làm việc của người dùng, lưu trữ thông tin về Kubernetes pod, cấu hình tài nguyên và môi trường.
- **`workspace_events`**: Ghi nhận các sự kiện xảy ra bên trong một workspace.
- **`external_runtime_sessions`**: Các phiên kết nối tới runtime bên ngoài (VD: Google Colab).
- **`workspace_datasets` & `workspace_models`**: Các bảng liên kết (cross-schema) để ánh xạ workspace với datasets và models tương ứng trong `mlops`.

### Tích hợp & Kết nối (Integrations & Providers)
- **`storage_providers`**: Định nghĩa các nhà cung cấp lưu trữ (MinIO, S3, GDrive).
- **`storage_connections`**: Quản lý thông tin kết nối lưu trữ cụ thể của từng người dùng.
- **`git_accounts`**: Quản lý tài khoản Git của người dùng (GitHub, GitLab, Bitbucket).
- **`git_repositories`**: Các kho lưu trữ (repository) Git được theo dõi và đồng bộ.
- **`git_sync_preferences`**: Tuỳ chọn đồng bộ hoá Git của từng người dùng.

---

## 2. Quản lý vòng đời ML (MLOps - `mlops` schema)

### Dữ liệu (Datasets) & DVC (Data Version Control)
- **`dvc_profiles`**: Cấu hình hồ sơ DVC để theo dõi dữ liệu thông qua Git và Storage.
- **`datasets`**: Thông tin tổng quan về các tập dữ liệu (image, text, tabular,...).
- **`dataset_versions`**: Quản lý các phiên bản (version) cụ thể của dataset, liên kết chặt chẽ với commit của DVC.

### Thử nghiệm & Lượt chạy (Experiments & Runs)
- **`experiments`**: Theo dõi các thử nghiệm ML (MLflow experiments).
- **`runs`**: Lượt chạy thực tế trong một thử nghiệm, có thể xuất phát từ notebook, job hoặc project.
- **`run_logs`**: Lưu trữ log của các lượt chạy (runs).

### Đăng ký mô hình (Model Registry)
- **`model_versions`**: Quản lý các phiên bản mô hình ML và trạng thái (Staging, Production,...).
- **`approval_requests`**: Quá trình duyệt (approve) các phiên bản mô hình để đưa lên môi trường cao hơn (như Production).
- **`model_dataset_links`**: Lưu trữ dấu vết (lineage) kết nối giữa một mô hình và tập dữ liệu đã dùng để huấn luyện/đánh giá.

### Nhật ký kiểm toán (Auditing)
- **`audit_logs`**: Bảng ghi nhật ký (append-only) theo dõi tất cả các thao tác thay đổi (thêm/sửa/xoá) trong schema MLOps.

---

## Mối quan hệ chính (Key Relationships)
- Mọi thực thể chính (`workspaces`, `git_accounts`, `datasets`, `experiments`, `model_versions`) đều được gắn với `user_id` từ bảng `public.users`.
- Bảng `runs` đóng vai trò cầu nối, gắn kết các thử nghiệm (`experiments`) với môi trường thực thi (`workspaces`).
- Lineage (vết dữ liệu) được đảm bảo qua bảng `model_dataset_links`, liên kết trực tiếp một phiên bản mô hình với phiên bản dữ liệu tương ứng.
