export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: { request_id?: string; retry_after?: number; [key: string]: unknown };
}
