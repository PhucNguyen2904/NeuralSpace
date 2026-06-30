# 04 - Cài đặt Frontend (Giao diện Web)

Dự án NeuralSpace sở hữu một giao diện quản lý Next.js với đầy đủ các tính năng như quản trị model, dataset, lineage và workspace.

## Cài đặt thư viện (Dependencies)

1. Mở một Terminal / Command Prompt khác và truy cập vào thư mục `frontend`:
   ```bash
   cd frontend
   ```

2. Cài đặt các thư viện (packages) cho Next.js bằng `npm`:
   ```bash
   npm install
   ```
   > [!TIP]
   > Bạn có thể sử dụng `yarn install` hoặc `pnpm install` nếu đã cấu hình sẵn những package manager này.

## Khởi chạy Server Development

1. Khởi động Web Server (mặc định sẽ map với backend chạy qua cổng 8000):
   ```bash
   npm run dev
   ```

2. Next.js sẽ tiến hành build và khởi động. Khi thấy thông báo thành công, bạn mở trình duyệt web và truy cập địa chỉ sau:
   - [http://localhost:3000](http://localhost:3000)

## Môi trường Production

Nếu bạn cần build bản Production (tối ưu hoá và rút gọn bundle):
```bash
npm run build
npm run start
```

---
*➡ Tiếp theo: Hãy chuyển sang **05-usage-guide.md** để xem hướng dẫn sử dụng và kiểm tra hệ thống.*
