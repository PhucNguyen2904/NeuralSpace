"use client";
import { useEffect } from "react";
export function useWorkspaceEvents(workspaceId: string, onMessage: (data: unknown) => void){ useEffect(()=>{ if(!workspaceId) return; const source = new EventSource(`/api/v1/events/workspaces/${workspaceId}`); source.onmessage=(e)=>{ try{ onMessage(JSON.parse(e.data)); } catch { onMessage(e.data); } }; return ()=>source.close(); },[workspaceId,onMessage]); }
