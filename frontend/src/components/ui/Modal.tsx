"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const modalSizes = cva("w-full rounded-xl bg-bg-surface shadow-lg animate-scaleIn", {
  variants: {
    size: {
      xs: "max-w-[300px]",
      sm: "max-w-[400px]",
      md: "max-w-[min(90vw,640px)]",
      lg: "max-w-[720px]",
      full: "max-w-[calc(100vw-32px)]"
    }
  },
  defaultVariants: { size: "md" }
});

interface ModalProps extends VariantProps<typeof modalSizes> {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  showCloseButton?: boolean;
  allowContentOverflow?: boolean;
  closeOnBackdrop?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  footer,
  children,
  size,
  showCloseButton = false,
  allowContentOverflow = false,
  closeOnBackdrop = true
}: ModalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const latestOnCloseRef = React.useRef(onClose);

  const [isMouseDownOnBackdrop, setIsMouseDownOnBackdrop] = React.useState(false);

  React.useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const node = containerRef.current;
    const focusable = node?.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        latestOnCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;
  const compact = size === "xs";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,17,23,0.4)] p-4 backdrop-blur-sm animate-fadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setIsMouseDownOnBackdrop(true);
        } else {
          setIsMouseDownOnBackdrop(false);
        }
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget && isMouseDownOnBackdrop) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          modalSizes({ size }),
          "flex max-h-[min(90vh,680px)] flex-col",
          allowContentOverflow ? "overflow-visible" : "overflow-hidden"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className={cn("shrink-0 border-b border-border font-semibold", compact ? "px-4 py-3 text-base" : "px-6 py-4 text-[15px]")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{title}</div>
              {showCloseButton ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-secondary"
                  aria-label="Close modal"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className={cn("flex-1 overflow-y-auto scrollbar-thin", compact ? "px-4 py-3" : "px-6 py-5")}>{children}</div>
        {footer ? <div className={cn("shrink-0 border-t border-border bg-bg-surface", compact ? "px-4 py-3" : "px-6 py-4")}>{footer}</div> : null}
      </div>
    </div>
  );
}

