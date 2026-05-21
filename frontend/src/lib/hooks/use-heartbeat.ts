"use client";
import { useEffect } from "react";
export function useHeartbeat(callback: () => void, intervalMs = 15000){ useEffect(()=>{ const id=window.setInterval(callback, intervalMs); return ()=>window.clearInterval(id); },[callback, intervalMs]); }
