import type { AxiosError } from "axios";
import { apiClient } from "@/lib/api/client";

type ApiErrorShape = {
  detail?: string;
  retry_after?: number;
};

let attached = false;

const toFriendlyMessage = (error: AxiosError<ApiErrorShape>) => {
  const status = error.response?.status;
  const payload = error.response?.data;
  if (status === 400) return "Dữ liệu không hợp lệ. Kiểm tra lại form.";
  if (status === 403) return "Bạn không có quyền thực hiện hành động này.";
  if (status === 404) return "Không tìm thấy tài nguyên.";
  if (status === 409) return "Thao tác không hợp lệ với trạng thái hiện tại.";
  if (status === 429) return `Quá nhiều yêu cầu. Thử lại sau ${payload?.retry_after ?? 30} giây.`;
  if (status && status >= 500) return "Lỗi server. Đội ngũ kỹ thuật đã được thông báo.";
  return payload?.detail ?? "Đã có lỗi xảy ra. Vui lòng thử lại.";
};

export function setupApiErrorHandler() {
  if (attached) return;
  attached = true;

  apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorShape>) => {
      if (error.response?.status === 401 && typeof window !== "undefined") {
        window.location.href = "/login";
        return Promise.reject(error);
      }
      const message = toFriendlyMessage(error);
      return Promise.reject(new Error(message));
    }
  );
}
