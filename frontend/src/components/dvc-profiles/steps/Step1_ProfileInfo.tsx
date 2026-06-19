import { useState } from "react";

// Form đơn giản: chỉ có 1 input tên profile
// Focal point: input lớn, centered, không có distraction
// Submit → handleCreateProfile

interface Props {
  onSubmit: (payload: { name: string }) => void;
  isLoading: boolean;
  error: string | null;
}

export function Step1_ProfileInfo({ onSubmit, isLoading, error }: Props) {
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Create DVC Profile
        </h2>
        <p className="text-sm text-text-secondary">
          Managed Git profiles automatically sync dataset metadata to your GitHub repo.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          Profile Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. ml-pipeline-v2"
          className="
            w-full px-4 py-3 rounded-lg bg-bg-sunken border border-border
            text-text-primary placeholder:text-text-tertiary text-sm
            focus:outline-none focus:border-brand-500 focus:bg-bg-surface
            transition-all duration-200
          "
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSubmit({ name })}
        />
      </div>

      {error && (
        <p className="text-sm text-error-500 bg-error-50 dark:bg-error-500/10 px-3 py-2 rounded-lg border border-error-500/20">
          {error}
        </p>
      )}

      <button
        onClick={() => onSubmit({ name: name.trim() })}
        disabled={!name.trim() || isLoading}
        className="
          w-full py-3 rounded-lg bg-brand-600 hover:bg-brand-700
          text-white text-sm font-medium
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          flex items-center justify-center gap-2
        "
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating...
          </>
        ) : (
          "Continue →"
        )}
      </button>
    </div>
  );
}
