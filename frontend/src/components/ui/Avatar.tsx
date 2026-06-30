import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Avatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  const [error, setError] = React.useState(false);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  React.useEffect(() => {
    setError(false);
  }, [src]);

  if (src && !error) {
    return <img src={src} alt={name} className={cn("h-8 w-8 rounded-full object-cover", className)} onError={() => setError(true)} />;
  }

  return <div className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600", className)}>{initials}</div>;
}
