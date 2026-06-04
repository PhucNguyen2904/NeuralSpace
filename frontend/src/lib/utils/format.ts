import { formatDistanceToNowStrict } from "date-fns";
export function formatBytes(bytes: number): string { if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"; const u=["B","KB","MB","GB","TB"]; const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),u.length-1); const v=bytes/1024**i; return `${v.toFixed(v>=10?0:1)} ${u[i]}`; }
export function formatDuration(seconds: number): string { if (seconds<=0) return "0m"; const h=Math.floor(seconds/3600); const m=Math.floor((seconds%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; }
export function formatRelativeTime(isoDate: string): string { return formatDistanceToNowStrict(new Date(isoDate), { addSuffix: true }); }
export function formatCountdown(isoDate: string): string { const rem=Math.max(0,Math.floor((new Date(isoDate).getTime()-Date.now())/1000)); const mm=String(Math.floor(rem/60)).padStart(2,"0"); const ss=String(rem%60).padStart(2,"0"); return `${mm}:${ss}`; }
