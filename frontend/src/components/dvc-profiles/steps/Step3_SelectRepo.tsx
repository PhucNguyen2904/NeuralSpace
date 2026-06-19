import { useState } from "react";

// User chọn owner + repo name
// Preview SSH URL realtime bên dưới
// Submit → handleSetupRepo → backend tự tạo key + đăng ký lên GitHub

interface Props {
  onSubmit: (payload: { repo_owner: string; repo_name: string }) => void;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
}

export function Step3_SelectRepo({ onSubmit, onBack, isLoading, error }: Props) {
  const [owner, setOwner] = useState("");
  const [repo, setRepo]   = useState("");

  const isValid = owner.trim() && repo.trim();
  const sshPreview = isValid
    ? `git@github.com:${owner.trim()}/${repo.trim()}.git`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Select Repository
        </h2>
        <p className="text-sm text-text-secondary">
          Chọn repo sẽ lưu DVC metadata. NeuralSpace sẽ tự cấu hình SSH key.
        </p>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
            Owner
          </label>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="mycompany"
            className="
              w-full px-4 py-3 rounded-lg bg-bg-sunken border border-border
              text-text-primary placeholder:text-text-tertiary text-sm
              focus:outline-none focus:border-brand-500 focus:bg-bg-surface
              transition-all duration-200
            "
          />
        </div>

        <div className="flex items-end pb-3 text-text-tertiary text-lg">/</div>

        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
            Repository
          </label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="ml-datasets"
            className="
              w-full px-4 py-3 rounded-lg bg-bg-sunken border border-border
              text-text-primary placeholder:text-text-tertiary text-sm
              focus:outline-none focus:border-brand-500 focus:bg-bg-surface
              transition-all duration-200
            "
          />
        </div>
      </div>

      {/* SSH URL Preview */}
      {sshPreview && (
        <div className="rounded-lg bg-bg-elevated border border-border px-4 py-3">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
            SSH Remote
          </p>
          <p className="text-xs text-brand-600 dark:text-brand-400 font-mono break-all">
            {sshPreview}
          </p>
        </div>
      )}

      {/* Loading state: đang setup SSH key */}
      {isLoading && (
        <div className="rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-500/20 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="w-3.5 h-3.5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            <p className="text-xs text-brand-700 dark:text-brand-400">
              Đang tạo SSH key và đăng ký lên GitHub...
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-error-500 bg-error-50 dark:bg-error-500/10 border border-error-500/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="
            px-4 py-3 rounded-lg border border-border bg-bg-surface
            text-text-secondary text-sm hover:text-text-primary hover:bg-bg-elevated
            disabled:opacity-50
            transition-colors duration-200
          "
        >
          ← Back
        </button>

        <button
          onClick={() => onSubmit({
            repo_owner: owner.trim(),
            repo_name: repo.trim(),
          })}
          disabled={!isValid || isLoading}
          className="
            flex-1 py-3 rounded-lg bg-brand-600 hover:bg-brand-700
            text-white text-sm font-medium
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
            flex items-center justify-center gap-2
          "
        >
          {isLoading ? "Setting up..." : "Finish Setup →"}
        </button>
      </div>
    </div>
  );
}
