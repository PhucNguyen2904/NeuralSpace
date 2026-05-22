"use client";

import { Check, X } from "lucide-react";

type Criterion = {
  label: string;
  met: boolean;
};

const strengthMeta = [
  { label: "Weak", color: "bg-error-500" },
  { label: "Fair", color: "bg-orange-500" },
  { label: "Good", color: "bg-yellow-400" },
  { label: "Strong", color: "bg-success-500" }
];

export function getPasswordStrength(password: string) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password)
  };

  const score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
}

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const { score, checks } = getPasswordStrength(password);
  const level = Math.min(Math.max(score, 0), 4);
  const criteria: Criterion[] = [
    { label: "8+ chars", met: checks.length },
    { label: "Uppercase", met: checks.uppercase },
    { label: "Number", met: checks.number }
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((item) => (
          <span
            key={item}
            className={`h-1.5 flex-1 rounded-full ${item <= level ? strengthMeta[Math.max(level - 1, 0)].color : "bg-bg-elevated"}`}
          />
        ))}
      </div>
      <p className="text-xs text-text-secondary">Strength: {password ? strengthMeta[Math.max(level - 1, 0)].label : "-"}</p>
      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
        {criteria.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1">
            {item.met ? <Check size={12} className="text-success-500" /> : <X size={12} className="text-text-tertiary" />}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
