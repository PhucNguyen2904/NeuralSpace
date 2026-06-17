function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`skeleton-shimmer rounded ${className}`} />
  );
}

export default function WorkspaceDetailLoading() {
  return (
    <div className="flex min-h-0 flex-col space-y-5 px-4 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-7 w-36 rounded-full" />
      </div>

      {/* Connect Colab card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-sm">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] lg:p-6">
          {/* Left: steps */}
          <div className="space-y-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="mt-4 h-3 w-40" />
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-5/6 max-w-md" />
            <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: claim code card */}
          <div className="flex flex-col justify-center rounded-xl border border-border bg-bg-surface/90 p-4 shadow-sm space-y-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-3 h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Assets panel */}
      <div className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Runtime activity header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm space-y-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        ))}
      </div>

      {/* Metrics + Logs */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm space-y-4">
          <Skeleton className="h-3 w-28" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>

      {/* Artifacts */}
      <div className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm space-y-4">
        <Skeleton className="h-3 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
