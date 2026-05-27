import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  iconRight?: React.ReactNode;
}

/** Storybook: Form input with dark terminal styling. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, iconRight, id, ...props }, ref) => {
    const inputId = id ?? React.useId();

    return (
      <div className="space-y-1.5">
        {label ? (
          <label htmlFor={inputId} className="block text-sm font-medium text-text-secondary">
            {label}
          </label>
        ) : null}

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "h-9 w-full select-text rounded-md border border-border bg-bg-surface px-3 text-sm text-text-primary caret-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              iconRight ? "pr-10" : "",
              error ? "border-error-500 focus-visible:ring-error-500/50" : "",
              className
            )}
            {...props}
          />
          {iconRight ? <div className="absolute inset-y-0 right-2 flex items-center">{iconRight}</div> : null}
        </div>

        {error ? <p className="text-xs text-error-500">{error}</p> : null}
      </div>
    );
  }
);
Input.displayName="Input";
