"use client";

import type { ReactNode } from "react";
import React from "react";
import { Button } from "@/components/ui";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class GlobalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("GlobalErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg-base p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-bg-surface p-6 text-center">
            <div className="mb-3 text-4xl" aria-hidden>🛠</div>
            <h1 className="text-xl font-semibold text-text-primary">Đã có lỗi bất ngờ</h1>
            <p className="mt-2 text-sm text-text-secondary">Đội ngũ kỹ thuật đã được thông báo. Bạn có thể tải lại trang.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => window.open("mailto:support@neuralspace.dev")} aria-label="Báo cáo lỗi">Báo cáo lỗi</Button>
              <Button onClick={() => window.location.reload()} aria-label="Tải lại trang">Tải lại trang</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
