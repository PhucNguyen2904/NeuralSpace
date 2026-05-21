"use client";
import axios, { AxiosError } from "axios";
import { API_TIMEOUT_MS } from "@/lib/constants";
import { useAuthStore } from "@/lib/stores/auth.store";
import type { ApiResponse } from "@/types";
import { toast } from "@/components/ui/toast";
export const apiClient = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL, timeout: API_TIMEOUT_MS });
apiClient.interceptors.request.use((config)=>{const token=useAuthStore.getState().token;if(token){config.headers.Authorization=`Bearer ${token}`;}return config;});
apiClient.interceptors.response.use((res)=>res,(error:AxiosError<{meta?:{retry_after?:number}}> )=>{ if(!error.response){toast.error("Mất kết nối");return Promise.reject(error);} const s=error.response.status; if(s===401){useAuthStore.getState().clearAuth(); if(typeof window!=="undefined") window.location.href="/login";} else if(s===429){toast.warning(`Quá nhiều yêu cầu, vui lòng chờ ${error.response.data?.meta?.retry_after ?? 0}s`);} else if(s>=500){toast.error("Lỗi server, vui lòng thử lại");} return Promise.reject(error);});
export async function unwrapResponse<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> { const { data } = await promise; return data.data; }
