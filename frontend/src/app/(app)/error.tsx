"use client";

import { RouteErrorBoundary } from "@/components/error/RouteErrorBoundary";

export default function AppRouteError({ reset }: { reset: () => void }) {
  return <RouteErrorBoundary onRetry={reset} />;
}
