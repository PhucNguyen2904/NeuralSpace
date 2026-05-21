import * as React from "react";
import { cn } from "@/lib/utils/cn";
/** Storybook: Card primitive with visual variants and content slots. */
export function Card({ className, variant="default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default"|"elevated"|"interactive" }){ return <div className={cn("rounded-lg border border-border bg-bg-surface", variant==="elevated"&&"bg-bg-elevated shadow-panel", variant==="interactive"&&"transition-transform hover:-translate-y-0.5 hover:bg-bg-elevated", className)} {...props}/>; }
export function CardHeader({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("border-b border-border px-4 py-3",className)} {...props}/>;}
export function CardContent({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("px-4 py-3",className)} {...props}/>;}
export function CardFooter({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("border-t border-border px-4 py-3",className)} {...props}/>;}
