import { apiClient, unwrapResponse } from "./client";
import type { ApiResponse } from "@/types";
import type { UserInfo } from "@/lib/stores/auth.store";
export interface LoginRequest { email: string; password: string; }
export interface LoginResponse { access_token: string; user: UserInfo; }
export function login(payload: LoginRequest){ return unwrapResponse(apiClient.post<ApiResponse<LoginResponse>>("/auth/login", payload)); }
export function getProfile(){ return unwrapResponse(apiClient.get<ApiResponse<UserInfo>>("/auth/me")); }
