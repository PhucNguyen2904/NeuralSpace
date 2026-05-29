import { cn } from "@/lib/utils/cn";

export interface VersionTagProps {
  version: string;
  dvcMd5?: string;
  isLatest?: boolean;
  status?: "draft" | "validated" | "deprecated";
}

const STATUS_CONFIG: Record<NonNullable<VersionTagProps["status"]>, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-slate-100 text-slate-600"
  },
  validated: {
    label: "Validated",
    className: "bg-emerald-50 text-emerald-700"
  },
  deprecated: {
    label: "Deprecated",
    className: "bg-amber-50 text-amber-700"
  }
};

export function VersionTag({ version, dvcMd5, isLatest = false, status }: VersionTagProps) {
  const shortHash = dvcMd5 ? dvcMd5.slice(0, 7) : null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-bg-elevated px-3 py-1 text-xs font-medium text-text-secondary">
      <span className="text-text-primary">{version}</span>
      {shortHash ? (
        <>
          <span className="text-text-tertiary">•</span>
          <code className="font-mono text-[11px] text-text-secondary">{shortHash}</code>
        </>
      ) : null}
      {status ? (
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CONFIG[status].className)}>
          {STATUS_CONFIG[status].label}
        </span>
      ) : null}
      {isLatest ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">Latest</span> : null}
    </div>
  );
}
