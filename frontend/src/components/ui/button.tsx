import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
/** Storybook: Core action button with variants and loading state. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" | "lg"; loading?: boolean; }
const variantClassMap = {
  primary: "bg-brand-600 text-white hover:bg-brand-500 hover:shadow-brand",
  secondary: "border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated",
  danger: "bg-error-500 text-white hover:bg-error-500/90",
  ghost: "bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
};
const sizeClassMap = { sm:"h-7 px-3 text-xs", md:"h-8 px-3.5 text-sm", lg:"h-9 px-4 text-sm" };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({className,variant="primary",size="md",loading=false,disabled,children,...props},ref)=><button ref={ref} className={cn("inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all disabled:opacity-50",variantClassMap[variant],sizeClassMap[size],className)} disabled={disabled||loading} {...props}>{loading?<Loader2 className="h-4 w-4 animate-spin"/>:null}{children}</button>);
Button.displayName="Button";
