# Hướng dẫn sử dụng nền tảng NeuralSpace

Chào mừng bạn đến với NeuralSpace! Dưới đây là hướng dẫn chi tiết cách khai thác các chức năng của nền tảng để phục vụ cho công việc nghiên cứu và phát triển Machine Learning của bạn.

---

## 1. Quản lý Môi trường làm việc (Workspaces)

Workspace là nơi bạn thực hiện việc viết code và chạy mô hình. NeuralSpace giúp bạn dễ dàng cấu hình và quản lý các môi trường này.

*   **Cách khởi tạo Workspace mới:**
    Bạn vào mục **Workspaces** và chọn "Tạo mới". Tại đây, bạn có thể chọn loại phần cứng (CPU/GPU) và môi trường phần mềm mong muốn.
*   **Sử dụng Google Colab (External Runtime):**
    Nếu bạn chọn môi trường Colab, hệ thống sẽ sinh ra một đường link an toàn kèm theo một "Claim Code". Bạn chỉ cần mở link Colab, dán đoạn mã này vào là đã có thể kết nối môi trường tính toán miễn phí của Google với dữ liệu trên NeuralSpace một cách bảo mật.
*   **Gắn (Mount) Dữ liệu và Mô hình:**
    Thay vì phải tải file thủ công bằng code, bạn có thể chọn "Mount Dataset" hoặc "Mount Model" ngay khi tạo Workspace. Hệ thống sẽ tự động ánh xạ dữ liệu đó vào một thư mục cụ thể để bạn gọi ra dùng ngay lập tức.
*   **Quản lý vòng đời:**
    Hãy chú ý trạng thái của Workspace (Đang chạy, Đã dừng). Hệ thống có cơ chế tự động tắt (Auto-kill) nếu bạn quên không sử dụng để tiết kiệm tài nguyên.

---

## 2. Quản lý Dữ liệu (Datasets)

Dữ liệu của bạn không nên chỉ nằm trong các file nén rải rác. Chức năng này giúp bạn quản lý dữ liệu bài bản như quản lý mã nguồn.

*   **Tạo và phân loại Dữ liệu:**
    Vào **Datasets** > "Tạo mới", bạn có thể định nghĩa tập dữ liệu của mình thuộc loại gì (Hình ảnh, Văn bản, Bảng biểu...).
*   **Quản lý Phiên bản (Version Control):**
    Mỗi khi có dữ liệu mới được thêm vào, hãy tạo một "Version" mới. Hệ thống được tích hợp với DVC để theo dõi sự thay đổi. Việc này giúp bạn biết chính xác mô hình được huấn luyện bằng tập dữ liệu ở thời điểm nào, tránh rủi ro không thể tái tạo lại kết quả.

---

## 3. Theo dõi Thực nghiệm (Experiments & Runs)

Chức năng này đóng vai trò như một cuốn sổ tay phòng thí nghiệm kỹ thuật số, tự động ghi chép lại mọi quá trình huấn luyện (training).

*   **Nhóm các lần chạy bằng Experiments:**
    Tạo một **Experiment** để gom nhóm tất cả các lần chạy thử nghiệm có chung một mục tiêu (Ví dụ: `Nhan_dien_bien_bao`).
*   **Ghi nhận chi tiết từng lần chạy (Run):**
    Trong code huấn luyện, bạn có thể log lại các siêu tham số (như `learning_rate`) và các độ đo (như `accuracy`). Mỗi "Run" sẽ tự động lưu lại các chỉ số này, kèm theo commit code git tương ứng và phiên bản dữ liệu đầu vào đã sử dụng.
*   **Xem lại Terminal Log:**
    Nếu mô hình bị lỗi giữa chừng khi bạn không ngồi máy, bạn có thể vào phần **Run Logs** trên Web để xem lại toàn bộ thông báo lỗi (stdout/stderr) đã được hệ thống thu thập lại.

---

## 4. Quản lý Mô hình (Model Registry)

Khi một quá trình huấn luyện tạo ra một mô hình có kết quả tốt, bạn cần một nơi để lưu trữ và quản lý nó.

*   **Đăng ký mô hình mới:**
    Từ một lần chạy (Run) thành công, bạn nhấn nút "Đăng ký Mô hình". Mô hình này sẽ được đưa vào Sàn lưu trữ (Registry) của NeuralSpace.
*   **Truy xuất nguồn gốc (Lineage):**
    Khi xem chi tiết một mô hình, hệ thống sẽ hiển thị rõ ràng mô hình này được tạo ra từ lần chạy nào, và đã dùng bộ dữ liệu nào để huấn luyện hay kiểm thử. Bạn sẽ không bao giờ bị nhầm lẫn giữa hàng chục phiên bản mô hình khác nhau.
*   **Phân loại Giai đoạn (Stage):**
    Mô hình có thể được gắn nhãn theo các giai đoạn: Mới tạo (None), Chờ kiểm thử (Staging), Sẵn sàng triển khai (Production), hoặc Đã lưu trữ (Archived).

---

## 5. Quy trình Phê duyệt (Approval)

Để đảm bảo tính nghiêm ngặt trong môi trường doanh nghiệp, NeuralSpace cung cấp quy trình kiểm duyệt trước khi đưa mô hình vào ứng dụng thực tế.

*   **Gửi yêu cầu đưa lên Production:**
    Từ Model Registry, bạn không thể tự đổi trạng thái mô hình sang Production. Bạn cần gửi một "Yêu cầu Phê duyệt" (Approval Request).
*   **Đánh giá:**
    Người quản lý hoặc Reviewer sẽ xem xét các chỉ số, lịch sử dữ liệu của mô hình. Nếu đạt yêu cầu, họ sẽ "Phê duyệt" (Approve), lúc này mô hình mới chính thức chuyển sang trạng thái Production.

---

## 6. Cấu hình Tích hợp (Storage & Git)

Để các chức năng trên hoạt động trơn tru, bạn cần hướng dẫn cho hệ thống biết cách kết nối với hạ tầng của bạn.

*   **Tích hợp Nơi lưu trữ (Storage):**
    Trong phần Cài đặt, bạn có thể cấu hình thông tin đăng nhập cho các dịch vụ lưu trữ như MinIO, AWS S3 hay Google Drive để hệ thống biết nơi lưu file dữ liệu và mô hình.
*   **Tích hợp Mã nguồn (Git):**
    Kết nối tài khoản GitHub, GitLab hoặc Bitbucket. Bạn có thể bật tính năng tự động đồng bộ: hệ thống sẽ tự động commit code hoặc tạo Pull Request mới mỗi khi một quá trình huấn luyện hoàn tất thành công.
