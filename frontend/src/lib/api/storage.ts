import { apiClient, unwrapResponse } from "./client";
import type { ApiResponse } from "@/types";
export interface NotebookFile { id: string; name: string; size_bytes: number; updated_at: string; }
export function listNotebooks(){ return unwrapResponse(apiClient.get<ApiResponse<NotebookFile[]>>("/api/v1/storage/notebooks")); }
