"use client";
import { useQuery } from "@tanstack/react-query";
import { listWorkspaces } from "@/lib/api/workspaces";
export function useWorkspace(){ return useQuery({ queryKey:["workspaces"], queryFn:listWorkspaces, refetchInterval:5000 }); }
