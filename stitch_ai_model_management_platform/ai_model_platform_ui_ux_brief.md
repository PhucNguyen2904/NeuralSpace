# AI Model Management Platform - UI/UX Brief

## 1. User Flow (Luồng người dùng)
1. **Truy cập & Dashboard**: Người dùng bắt đầu tại Model Hub, xem nhanh các model hiện có và tài nguyên hệ thống.
2. **Import**: Click "Import Model" -> Dán URL/ID (HF/GitHub) -> Click "Download".
3. **Theo dõi**: Task được đẩy vào nền, xuất hiện Async Progress Card ở Sidebar hoặc Toast. Người dùng có thể tiếp tục duyệt Hub.
4. **Khởi chạy**: Model tải xong -> Click "Run/Deploy" trên thẻ model.
5. **Thiết lập môi trường**: Chuyển sang Workspace. Hệ thống hiển thị tiến trình "Booting Container" -> "Loading Weights".
6. **Tương tác**: Trạng thái chuyển sang "Ready". Người dùng bắt đầu viết code trong Editor hoặc test tại Playground.

## 2. Layout Structure (Bố cục)
- **Sidebar**: Logo, Navigation (Hub, Workspace, Settings), Recent Tasks/Downloads (với progress bar nhỏ).
- **Header**: Search bar, Resource Monitor (CPU, GPU, RAM usage sparklines), User Profile.
- **Main Content**:
    - **Model Hub**: Grid/List of model cards.
    - **Import**: Centered modal or dedicated simple page with a large input area.
    - **Workspace**: Two-pane layout. Left: Code Editor/Form Input. Right: Output/Terminal. Top: Status bar with resource usage.

## 3. UI Components chú trọng
- **Async Progress Card**: Hiển thị %, MB/s, ETA, và nút "Cancel/Pause".
- **Resource Monitor Widget**: Các biểu đồ mini (sparklines) hiển thị tải trọng GPU/RAM thời gian thực.
- **Status Badge**: Nhãn hiển thị trạng thái "Ready", "Downloading", "Indexing", "Error".
- **Code/Playground Toggle**: Chuyển đổi giữa giao diện lập trình và giao diện test nhanh.