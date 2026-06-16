"use client";

import { Button } from "@/components/ui";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  console.error("global-error", error);
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-bg-base p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-bg-surface p-6 text-center">
            <div className="mb-3 text-4xl" aria-hidden>🛠</div>
            <h1 className="text-xl font-semibold text-text-primary">An unexpected error occurred</h1>
            <p className="mt-2 text-sm text-text-secondary">The system has recorded this error.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => window.open("mailto:support@neuralspace.dev")} aria-label="Report issue">Report issue</Button>
              <Button onClick={() => window.location.reload()} aria-label="Reload page">Reload page</Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
