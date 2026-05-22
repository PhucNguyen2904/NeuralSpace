"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

  public render() {
    if (this.state.hasError) {
      return <div className="rounded-lg border border-error-500 bg-error-50 p-4 text-sm text-error-500">Something went wrong.</div>;
    }
    return this.props.children;
  }
}
