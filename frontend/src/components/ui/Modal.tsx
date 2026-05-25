"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const modalSizes = cva("w-full rounded-xl bg-bg-surface shadow-lg animate-scaleIn", {
  variants: {
    size: {
      sm: "max-w-[400px]",
      md: "max-w-[560px]",
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
}

export function Modal({ open, onClose, title, footer, children, size }: ModalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const node = containerRef.current;
    const focusable = node?.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,17,23,0.4)] p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose} role="presentation">
      <div ref={containerRef} role="dialog" aria-modal="true" className={cn(modalSizes({ size }))} onClick={(e) => e.stopPropagation()}>
        {title ? <div className="border-b border-border px-5 py-4 text-lg font-semibold">{title}</div> : null}
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-border px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
