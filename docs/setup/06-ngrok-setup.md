# 06 - Cài đặt Ngrok (Expose Localhost ra Internet)

Một trong những tính năng cốt lõi của NeuralSpace là tích hợp trực tiếp với **Google Colab** hoặc các dịch vụ Webhook (như MLflow webhook). Để Google Colab (đang chạy trên server của Google) có thể giao tiếp được với Backend (đang chạy trên máy tính local của bạn), bạn cần phải đưa Backend ra Internet bằng công cụ như **ngrok**.

## 1. Cài đặt Ngrok

1. Đăng ký tài khoản và tải Ngrok tại: [https://ngrok.com/download](https://ngrok.com/download)
2. Cài đặt và thiết lập authtoken của bạn:
   ```bash
   ngrok config add-authtoken <YOUR_AUTHTOKEN>
   ```

## 2. Expose Backend (API)

Backend của NeuralSpace mặc định chạy trên cổng `8000`. Để mở cổng này ra Internet:

```bash
ngrok http 8000
```

Ngrok sẽ cung cấp cho bạn một địa chỉ URL (Forwarding URL), ví dụ: 
`https://a1b2c3d4.ngrok-free.app` -> `http://localhost:8000`

## 3. Cấu hình cho Google Colab Integration

Sau khi có public URL từ ngrok, bạn cần cập nhật thông tin để Colab biết cần gọi API đến đâu.

1. Khi tạo Workspace để chạy Colab, bạn sẽ lấy được đoạn script khởi tạo.
2. Bạn cần cấu hình biến môi trường `API_BASE` trong Colab notebook sao cho trỏ tới URL của ngrok.
   Ví dụ, nếu ngrok của bạn là `https://a1b2c3d4.ngrok-free.app`, hãy thiết lập:
   ```python
   API_BASE = "https://a1b2c3d4.ngrok-free.app/api/v1"
   ```

## 4. Cơ chế tải File (Dataset & Model Download) qua Ngrok

Một vấn đề phổ biến khi tích hợp local server với Google Colab là Colab cần tải dataset/model từ bộ lưu trữ MinIO (đang chạy ở `localhost:9000`).

Trong NeuralSpace, **bạn không cần cấu hình ngrok riêng cho cổng MinIO**. 
Hệ thống sử dụng cơ chế **Proxy-Stream**:
- Khi Colab yêu cầu tải file, Backend sẽ trả về đường dẫn tải tương đối (relative path) trỏ về Backend API (ví dụ: `/api/v1/datasets/{id}/minio-stream`).
- Trình duyệt hoặc Colab sẽ gửi request tải thông qua URL ngrok của Backend (cổng `8000`).
- Backend tự kết nối nội bộ với MinIO (`localhost:9000`) và "stream" dữ liệu ngược lại cho Colab thông qua kết nối ngrok đang mở.

Do đó, chỉ với duy nhất một tunnel ngrok cho cổng `8000`, toàn bộ các tính năng bao gồm cả tải file dung lượng lớn từ MinIO vẫn hoạt động bình thường.

## (Tuỳ chọn) Expose Frontend

Nếu bạn muốn truy cập giao diện UI của NeuralSpace từ các thiết bị khác qua mạng ngoài:
```bash
ngrok http 3000
```
Lúc này bạn có thể vào đường dẫn ngrok cấp phát trên điện thoại hoặc máy tính khác để quản lý model và dataset.

---
> [!NOTE]
> Lưu ý: Mỗi khi tắt/bật lại ngrok bản miễn phí, URL sẽ thay đổi. Hãy nhớ cập nhật lại `API_BASE` trong các file Google Colab Notebook của bạn tương ứng.

