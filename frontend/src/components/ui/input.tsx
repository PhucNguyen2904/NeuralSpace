import * as React from "react";
import { cn } from "@/lib/utils/cn";
/** Storybook: Form input with dark terminal styling. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({className,...props},ref)=><input ref={ref} className={cn("h-9 w-full rounded-md border border-border bg-bg-surface px-3 text-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",className)} {...props}/>);
Input.displayName="Input";
