"use client";

import { Button } from "@/components/ui";

export function RouteErrorBoundary({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg-surface p-6 text-center">
        <h2 className="text-lg font-semibold text-text-primary">Không thể tải trang này</h2>
        <p className="mt-2 text-sm text-text-secondary">Vui lòng thử tải lại route hiện tại.</p>
        <div className="mt-4">
          <Button onClick={() => (onRetry ? onRetry() : window.location.reload())} aria-label="Tải lại route">Tải lại</Button>
        </div>
      </div>
    </div>
  );
}
