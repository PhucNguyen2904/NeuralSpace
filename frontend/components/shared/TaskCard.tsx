'use client';

interface TaskCardProps {
  title: string;
  icon: string;
  iconColor?: string;
  speed?: string;
  eta?: string;
  progress?: number;
  progressLabel?: string;
  dataUsage?: string;
  isLoading?: boolean;
  onCancel?: () => void;
}

export function TaskCard({
  title,
  icon,
  iconColor = 'text-primary',
  speed,
  eta,
  progress = 0,
  progressLabel = 'DOWNLOADING',
  dataUsage,
  isLoading = false,
  onCancel,
}: TaskCardProps) {
  return (
    <div
      className={`bg-surface-container p-stack-md rounded-xl border border-outline-variant flex flex-col gap-stack-md ${
        isLoading ? 'opacity-90' : ''
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined ${iconColor}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {icon}
            </span>
            <span className="font-headline-md text-on-surface">{title}</span>
          </div>
          <div className="flex items-center gap-4 font-label-mono text-label-mono text-on-surface-variant">
            {speed && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">
                  speed
                </span>
                {speed}
              </span>
            )}
            {eta && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">
                  timer
                </span>
                {eta}
              </span>
            )}
            {dataUsage && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">
                  data_usage
                </span>
                {dataUsage}
              </span>
            )}
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-on-error-container bg-error-container/20 hover:bg-error-container/40 px-3 py-1.5 rounded-lg font-body-md text-body-md flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
            Cancel
          </button>
        )}
      </div>

      {progress !== undefined && (
        <div className="w-full">
          <div className="flex justify-between items-center mb-2">
            <span className={`font-label-mono text-label-mono ${
              iconColor === 'text-tertiary' ? 'text-tertiary' : 'text-primary'
            }`}>
              {progressLabel}
            </span>
            <span className="font-label-mono text-label-mono text-on-surface">
              {progress}%
            </span>
          </div>
          <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                iconColor === 'text-tertiary' ? 'bg-tertiary' : 'bg-primary'
              } ${progress > 0 && !isLoading ? 'progress-pulse' : ''}`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}
