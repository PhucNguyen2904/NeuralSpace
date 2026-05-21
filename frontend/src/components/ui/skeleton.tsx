import { cn } from "@/lib/utils/cn";
/** Storybook: Generic shimmer skeleton block. */
export function Skeleton({className}:{className?:string}){return <div className={cn("animate-shimmer rounded-md bg-gradient-to-r from-bg-overlay via-bg-elevated to-bg-overlay bg-[length:200%_100%]",className)}/>;}
/** Storybook: Card skeleton for workspace tiles. */
export function SkeletonCard(){return <div className="rounded-lg border border-border bg-bg-surface p-4"><Skeleton className="mb-3 h-4 w-1/3"/><Skeleton className="mb-2 h-3 w-2/3"/><Skeleton className="h-3 w-1/2"/></div>;}
/** Storybook: Table skeleton for dense data list loading states. */
export function SkeletonTable({rows=5}:{rows?:number}){return <div className="space-y-2">{Array.from({length:rows}).map((_,i)=><Skeleton key={i} className="h-9 w-full"/>)}</div>;}
/** Storybook: Text skeleton paragraph lines. */
export function SkeletonText({lines=3}:{lines?:number}){return <div className="space-y-2">{Array.from({length:lines}).map((_,i)=><Skeleton key={i} className={cn("h-3",i===lines-1?"w-2/3":"w-full")}/>)}</div>;}
