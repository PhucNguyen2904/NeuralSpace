// Màn hình kết thúc
// Hiển thị kết nối: NeuralSpace ←→ GitHub repo
// 1 nút duy nhất: Start Uploading

interface Props {
  profileName: string;
  repoOwner: string;
  repoName: string;
  onFinish: () => void;
}

export function Step4_Success({ profileName, repoOwner, repoName, onFinish }: Props) {
  return (
    <div className="flex flex-col items-center gap-8 py-4 text-center">

      {/* Success icon */}
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/30
          flex items-center justify-center text-2xl text-emerald-600 dark:text-emerald-400
          shadow-sm">
          ✓
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Profile Ready!
        </h2>
        <p className="text-sm text-text-secondary">
          SSH Deploy Key đã được đăng ký tự động.
        </p>
      </div>

      {/* Connection diagram */}
      <div className="w-full flex items-center justify-center gap-4 
        rounded-xl bg-bg-sunken border border-border px-6 py-5">
        <div className="text-center">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
            Profile
          </p>
          <p className="text-sm font-medium text-text-primary">{profileName}</p>
        </div>

        <div className="flex items-center gap-1 text-brand-500/60">
          <div className="w-8 h-px bg-brand-500/40" />
          <span className="text-xs font-medium">SSH</span>
          <div className="w-8 h-px bg-brand-500/40" />
        </div>

        <div className="text-center">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
            GitHub
          </p>
          <p className="text-sm font-medium text-text-primary">
            {repoOwner}/{repoName}
          </p>
        </div>
      </div>

      <button
        onClick={onFinish}
        className="
          w-full py-3 rounded-lg bg-brand-600 hover:bg-brand-700
          text-white text-sm font-medium
          transition-all duration-200
        "
      >
        Finish Setup →
      </button>
    </div>
  );
}
