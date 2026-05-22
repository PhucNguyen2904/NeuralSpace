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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,17,23,0.4)] p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className={cn(modalSizes({ size }))} onClick={(e) => e.stopPropagation()}>
        {title ? <div className="border-b border-border px-5 py-4 text-lg font-semibold">{title}</div> : null}
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-border px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
