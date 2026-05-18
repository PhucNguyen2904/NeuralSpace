'use client';

import Image from 'next/image';

interface TopAppBarProps {
  title?: string;
  subtitle?: string;
  showSearch?: boolean;
  showMetrics?: boolean;
}

export function TopAppBar({
  title,
  subtitle,
  showSearch = true,
  showMetrics = true,
}: TopAppBarProps) {
  return (
    <header className="flex justify-between items-center w-full px-margin h-16 bg-surface border-b border-outline-variant shrink-0">
      <div className="flex items-center gap-stack-md">
        {showSearch && (
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
              search
            </span>
            <input
              className="bg-surface-container-low border border-outline-variant text-on-surface rounded-full py-1.5 pl-10 pr-4 w-64 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md text-body-md"
              placeholder="Search resources..."
              type="text"
            />
          </div>
        )}
        {title && (
          <>
            <span className="font-headline-lg text-headline-lg font-bold text-primary">
              {title}
            </span>
            {subtitle && (
              <>
                <div className="h-6 w-[1px] bg-outline-variant mx-2"></div>
                <div className="flex items-center gap-stack-sm">
                  <span className="font-label-mono text-label-mono text-on-surface">
                    Model:
                  </span>
                  <span className="font-label-mono text-label-mono text-primary font-bold">
                    {subtitle}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-stack-lg">
        {showMetrics && (
          <div className="flex items-center gap-4">
            <button className="text-on-surface-variant hover:bg-surface-container-high transition-colors p-2 rounded-full">
              <span className="material-symbols-outlined">memory</span>
            </button>
            <button className="text-on-surface-variant hover:bg-surface-container-high transition-colors p-2 rounded-full">
              <span className="material-symbols-outlined">developer_board</span>
            </button>
            <button className="text-on-surface-variant hover:bg-surface-container-high transition-colors p-2 rounded-full">
              <span className="material-symbols-outlined">monitoring</span>
            </button>
          </div>
        )}
        <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant bg-surface-container-low flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">account_circle</span>
        </div>
      </div>
    </header>
  );
}
