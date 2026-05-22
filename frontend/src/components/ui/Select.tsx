import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ className, label, children, ...props }: SelectProps) {
  return (
    <label className="space-y-1 text-sm text-text-secondary">
      {label}
      <select className={cn("h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-text-primary", className)} {...props}>
        {children}
      </select>
    </label>
  );
}
