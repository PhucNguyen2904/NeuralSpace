import { cn } from "@/lib/utils/cn";
/** Storybook: Progress bar for resource metrics and task completion. */
export function Progress({value,className}:{value:number;className?:string}){const v=Math.max(0,Math.min(100,value));return <div className={cn("h-2 w-full overflow-hidden rounded-full bg-bg-overlay",className)}><div className="h-full rounded-full bg-accent" style={{width:`${v}%`}}/></div>;}
