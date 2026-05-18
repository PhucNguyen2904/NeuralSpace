# 🖥️ NeuralForge Frontend UI/UX Functionality Audit

Tài liệu này tổng hợp toàn bộ các **nút bấm (Buttons)**, **Mô-đun (Modules)**, và **Bộ điều khiển (Controls)** của ứng dụng **NeuralForge**. Dữ liệu được chia thành hai nhóm chính để bạn dễ dàng theo dõi và lên kế hoạch kết nối Backend:

*   ✅ **Đã hoạt động (Functional)**: Đã được liên kết với `useState`, có hiệu ứng chuyển đổi trạng thái thực tế trên giao diện.
*   🛑 **Giao diện tĩnh (Static Mock-only)**: Đã được tối ưu hóa hiển thị nhưng chưa có mã nguồn xử lý sự kiện `onClick` hoặc gọi API.

---

## 📊 1. Giao diện Danh sách Models (Hub Page)

**Đường dẫn:** `/hub` | **Mã nguồn:** `app/hub/page.tsx` & `components/hub/ModelCard.tsx`

| Thành phần giao diện | Loại điều khiển | Trạng thái | Chi tiết kỹ thuật & Hướng xử lý |
| :--- | :--- | :--- | :--- |
| **Filter Tabs** | Bộ lọc phân loại | ✅ **Hoạt động** | Lọc tức thì danh sách model (`All`, `LLM`, `Computer Vision`, `Audio`) bằng State cục bộ. |
| **Sort Label** | Sắp xếp hiển thị | 🛑 **Tĩnh** | Đang hiển thị nhãn tĩnh `Sort: Recently Used`. Cần thêm dropdown menu và state sắp xếp theo ngày/kích thước. |
| **Nút "Run"** (Model Ready) | Kích hoạt Model | 🛑 **Tĩnh** | Chưa có hàm `onClick`. Cần liên kết API để kích hoạt instance chạy cục bộ. |
| **Nút "Retry"** (Model Error) | Tải lại tác vụ lỗi | 🛑 **Tĩnh** | Cần gọi API `POST /api/v1/models/tasks/{task_id}/retry` để thực thi tải lại model. |
| **Nút "Settings" & "Delete"** | Cấu hình & Xóa | 🛑 **Tĩnh** | Cần gọi API `DELETE /api/v1/models/{model_id}` để xóa model và giải phóng bộ nhớ. |
| **Nút "Cancel"** (Model Downloading) | Hủy tác vụ tải | 🛑 **Tĩnh** | Cần gửi yêu cầu hủy tác vụ tải xuống Celery worker. |
| **Import Model Card** | Thêm mới model | 🛑 **Tĩnh** | Dashboard card nét đứt. Cần liên kết để chuyển hướng nhanh sang `/workspace` hoặc mở Modal Drag & Drop file. |

---

## 📥 2. Giao diện Tác vụ & Import (Workspace Page)

**Đường dẫn:** `/workspace` | **Mã nguồn:** `app/workspace/page.tsx`

| Thành phần giao diện | Loại điều khiển | Trạng thái | Chi tiết kỹ thuật & Hướng xử lý |
| :--- | :--- | :--- | :--- |
| **Model Manifest Input** | Nhập liệu URL/ID | 🛑 **Tĩnh** | Chưa gán State (`value`/`onChange`) để ghi nhận chuỗi ID từ Hugging Face hoặc URL Manifest. |
| **Nút "Download"** | Kích hoạt Download | 🛑 **Tĩnh** | Cần gọi API `POST /api/v1/models/download` gửi kèm thông tin từ Input để bắt đầu tiến trình tải thực tế. |
| **Active Tasks List** | Danh sách tiến trình | 🛑 **Tĩnh** | Hiện sử dụng 2 Task giả lập. Cần gọi API `GET /api/v1/models/tasks` theo chu kỳ (polling) để đồng bộ thanh tiến trình `%` thực tế. |
| **Nút "Cancel"** (Task Card) | Hủy download | 🛑 **Tĩnh** | Chưa gán hàm xử lý hủy tải cho từng task. |
| **Nút "Clear Completed"** | Dọn dẹp tác vụ | 🛑 **Tĩnh** | Cần cập nhật state để ẩn/xóa các tác vụ tải đã hoàn thành thành công khỏi màn hình. |

---

## ⚙️ 3. Giao diện cấu hình phần cứng (GPU Settings Page)

**Đường dẫn:** `/settings/hardware/gpu` | **Mã nguồn:** `app/settings/hardware/gpu/page.tsx`

| Thành phần giao diện | Loại điều khiển | Trạng thái | Chi tiết kỹ thuật & Hướng xử lý |
| :--- | :--- | :--- | :--- |
| **VRAM Limit** | Thanh trượt (Slider) | ✅ **Hoạt động** | Cập nhật trực tiếp số lượng GB thông qua state `vramLimit` khi trượt. |
| **Compute Priority** | Tabs lựa chọn | ✅ **Hoạt động** | Cho phép chọn giữa các chế độ `LOW`, `BALANCED`, `HIGH`. |
| **CUDA Core Utilization** | Nút gạt (Switch) | ✅ **Hoạt động** | Bật/tắt trạng thái tăng tốc CUDA với hoạt ảnh chuyển động chuẩn xác (đã được tối ưu). |
| **Performance Profiles** | Radio Cards lựa chọn | ✅ **Hoạt động** | Chọn profile cấu hình năng lượng/hiệu năng. Đã gán state `performanceProfile` đầy đủ. |
| **Check for Updates** | Cập nhật Driver | 🛑 **Tĩnh** | Chưa liên kết xử lý kiểm tra phiên bản Driver. |
| **Reset to Defaults** | Thiết lập lại | 🛑 **Tĩnh** | Cần thêm hàm `onClick` để khôi phục toàn bộ các State cấu hình bên trên về giá trị mặc định ban đầu. |
| **Save Changes** | Lưu cấu hình | 🛑 **Tĩnh** | Cần viết hàm gửi Payload chứa (`vramLimit`, `computePriority`, `cudaEnabled`, `performanceProfile`) lên API lưu cấu hình hệ thống. |

---

## 🌐 4. Hệ thống Header & Sidebar chung

**Đường dẫn:** Tất cả các trang | **Mã nguồn:** `components/layout/`

| Thành phần giao diện | Loại điều khiển | Trạng thái | Chi tiết kỹ thuật & Hướng xử lý |
| :--- | :--- | :--- | :--- |
| **Sidebar Navigation** | Khối liên kết điều hướng | ✅ **Hoạt động** | Tự động phát hiện trang hiện tại thông qua `usePathname()` để đổi màu active chuẩn xác. |
| **Deploy New Model** | Nút thao tác nhanh | 🛑 **Tĩnh** | Chưa liên kết xử lý. |
| **Active Downloads Badge** | Số hiển thị tiến trình | 🛑 **Tĩnh** | Hiện hiển thị cố định số `2` cùng vòng quay animation. Cần kết nối với State tổng của ứng dụng để đếm số task tải thực tế. |
| **CPU/GPU/RAM Stats** | Monitor mini phần cứng | 🛑 **Tĩnh** | Đang hiển thị thông số tĩnh. Cần tạo một polling-effect để định kỳ fetch dữ liệu hiệu năng server thực tế. |

---

## 🛠️ Hướng dẫn tích hợp kết nối API Backend mẫu

Để thực hiện kết nối API thực tế, bạn có thể triển khai `fetch` hoặc cài đặt thư viện `axios`. Dưới đây là ví dụ mẫu để fetch danh sách Model thực tế từ Backend và hiển thị lên **Hub Page**:

### 1. Tạo API Service đơn giản (`services/api.ts`)
```typescript
const BASE_URL = 'http://localhost:8000/api/v1';

export async function fetchModels() {
  const res = await fetch(`${BASE_URL}/models`);
  if (!res.ok) throw new Error('Không thể lấy danh sách models');
  return res.json(); // Trả về { items: Model[], total: number }
}
```

### 2. Sử dụng trong `app/hub/page.tsx`
```tsx
'use client'

import { useState, useEffect } from 'react'
import { fetchModels } from '@/services/api'
import { ModelCard } from '@/components/hub/ModelCard'

export default function HubPage() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchModels()
      .then(data => {
        setModels(data.items)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="text-white">Đang tải cấu trúc dữ liệu...</div>

  // Render Grid như bình thường sử dụng state `models` thay cho dữ liệu giả
}
```
