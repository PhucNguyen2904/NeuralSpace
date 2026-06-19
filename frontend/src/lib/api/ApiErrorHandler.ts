import type { AxiosError } from "axios";
import { apiClient } from "@/lib/api/client";

type ApiErrorShape = {
  detail?: string;
  retry_after?: number;
};

let attached = false;

const toFriendlyMessage = (error: AxiosError<ApiErrorShape>) => {
  // Không có response → lỗi mạng hoặc timeout
  if (!error.response) {
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      return "Request timed out. The operation is taking too long, please wait a moment and refresh.";
    }
    return "Cannot connect to server. Please check your network connection.";
  }
  const status = error.response?.status;
  const payload = error.response?.data;
  const detail = payload?.detail;
  const detailStr = typeof detail === "string" ? detail : undefined;
  if (status === 400) return detailStr ?? "Invalid data. Please check the form.";
  if (status === 403) return detailStr ?? "You do not have permission to perform this action.";
  if (status === 404) return detailStr ?? "Resource not found.";
  if (status === 409) return detailStr ?? "This action is not valid for the current state.";
  if (status === 429) return `Too many requests. Try again after ${payload?.retry_after ?? 30} seconds.`;
  if (status && status >= 500) return detailStr ?? "Server error. The engineering team has been notified.";
  return detailStr ?? "Something went wrong. Please try again.";
};

export function setupApiErrorHandler() {
  if (attached) return;
  attached = true;

  apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorShape>) => {
      if (error.response?.status === 401 && typeof window !== "undefined") {
        document.cookie = "auth_token=; Path=/; Max-Age=0; SameSite=Lax";
        if (!["/login", "/register"].includes(window.location.pathname)) {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
      const message = toFriendlyMessage(error);
      return Promise.reject(new Error(message));
    }
  );
}
