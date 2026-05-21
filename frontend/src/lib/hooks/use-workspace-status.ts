"use client";
import { useMemo } from "react";
import { useWorkspaceStore } from "@/lib/stores/workspace.store";
export function useWorkspaceStatus(workspaceId: string){ const workspaces = useWorkspaceStore((s)=>s.workspaces); return useMemo(()=>workspaces.get(workspaceId)?.status ?? "STOPPED",[workspaces,workspaceId]); }
