"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { motion } from "framer-motion";

type StepStatus = "pending" | "loading" | "done" | "error";

export function ProvisioningStep({ label, status }: { label: string; status: StepStatus }) {
  const icon =
    status === "done" ? (
      <CheckCircle2 size={16} className="text-success-500" />
    ) : status === "loading" ? (
      <Loader2 size={16} className="animate-spin text-brand-600" />
    ) : status === "error" ? (
      <XCircle size={16} className="text-error-500" />
    ) : (
      <Circle size={16} className="text-text-tertiary" />
    );

  return (
    <motion.li
      initial={{ opacity: 0.5, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-2 text-sm"
    >
      {icon}
      <span className={status === "pending" ? "text-text-tertiary" : "text-text-secondary"}>{label}</span>
    </motion.li>
  );
}
