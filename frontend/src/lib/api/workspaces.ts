import { apiClient, unwrapResponse } from "./client";
import type { ApiResponse, Workspace, WorkspaceActionResponse, WorkspaceCreateRequest } from "@/types";
export function listWorkspaces(){ return unwrapResponse(apiClient.get<ApiResponse<Workspace[]>>("/api/v1/workspaces")); }
export function createWorkspace(payload: WorkspaceCreateRequest){ return unwrapResponse(apiClient.post<ApiResponse<Workspace>>("/api/v1/workspaces",payload)); }
export function startWorkspace(workspaceId: string){ return unwrapResponse(apiClient.post<ApiResponse<WorkspaceActionResponse>>(`/api/v1/workspaces/${workspaceId}/start`)); }
export function stopWorkspace(workspaceId: string){ return unwrapResponse(apiClient.post<ApiResponse<WorkspaceActionResponse>>(`/api/v1/workspaces/${workspaceId}/stop`)); }
