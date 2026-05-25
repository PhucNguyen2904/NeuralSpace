"use client";

import { cn } from "@/lib/utils/cn";

type SkeletonShape = "line" | "title" | "avatar" | "card";

export function SkeletonLoader({
  shape = "line",
  className
}: {
  shape?: SkeletonShape;
  className?: string;
}) {
  const shapeClass =
    shape === "title"
      ? "h-6 w-40 rounded-md"
      : shape === "avatar"
        ? "h-10 w-10 rounded-full"
        : shape === "card"
          ? "h-24 w-full rounded-lg"
          : "h-4 w-full rounded";

  return <div className={cn("skeleton-shimmer", shapeClass, className)} aria-hidden="true" />;
}
