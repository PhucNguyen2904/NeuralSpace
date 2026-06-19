// Focal point: nút "Connect GitHub" lớn ở giữa
// Hiển thị rõ NeuralSpace chỉ yêu cầu quyền gì
// Không có form, chỉ có 1 action duy nhất

interface Props {
  onConnect: () => void;
  onBack: () => void;
  error: string | null;
}

export function Step2_ConnectGitHub({ onConnect, onBack, error }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Connect GitHub
        </h2>
        <p className="text-sm text-text-secondary">
          NeuralSpace sẽ yêu cầu quyền truy cập vào repo bạn chọn.
        </p>
      </div>

      {/* Permission summary */}
      <div className="rounded-lg border border-border bg-bg-sunken p-4 flex flex-col gap-3">
        {[
          { icon: "📁", label: "Contents", desc: "Read & Write — để push file .dvc" },
          { icon: "📋", label: "Metadata", desc: "Read-only — thông tin cơ bản của repo" },
        ].map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            <span className="text-base">{item.icon}</span>
            <div>
              <span className="text-xs font-medium text-text-primary">{item.label}</span>
              <p className="text-xs text-text-secondary mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lưu ý bảo mật */}
      <p className="text-xs text-text-tertiary leading-relaxed">
        🔒 NeuralSpace không lưu GitHub password hay PAT của bạn.
        Xác thực thực hiện hoàn toàn trên github.com.
      </p>

      {error && (
        <p className="text-sm text-error-500 bg-error-50 dark:bg-error-500/10 px-3 py-2 rounded-lg border border-error-500/20">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="
            px-4 py-3 rounded-lg border border-border bg-bg-surface
            text-text-secondary text-sm hover:text-text-primary hover:bg-bg-elevated
            transition-colors duration-200
          "
        >
          ← Back
        </button>

        <button
          onClick={onConnect}
          className="
            flex-1 py-3 rounded-lg
            bg-[#24292f] hover:bg-[#2d333a]
            border border-transparent
            text-white text-sm font-medium
            transition-all duration-200
            flex items-center justify-center gap-2.5
          "
        >
          {/* GitHub icon SVG */}
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
              .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
              -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
              .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
              .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
              0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          Connect GitHub
        </button>
      </div>
    </div>
  );
}
