"use client";

import Link from "next/link";
import { ChevronLeft, ExternalLink, Monitor } from "lucide-react";
import { Button } from "@/components/ui";

interface WorkspaceIdePageProps {
  params: { id: string };
}

export default function WorkspaceIdePage({ params }: WorkspaceIdePageProps): JSX.Element {
  const colabUrl = "https://colab.research.google.com/";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link
          href="/workspaces"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        >
          <ChevronLeft size={14} />
          Quay lại Workspaces
        </Link>
      </div>
      <div className="rounded-xl border border-border bg-bg-surface p-6">
        <h1 className="text-xl font-semibold text-text-primary">Chọn môi trường làm việc</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Workspace <span className="font-medium text-text-primary">{params.id}</span>
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <Link href={`/workspaces/${params.id}/neuralspace`} className="block">
            <Button className="h-14 w-full justify-start gap-2 text-left">
              <Monitor size={18} />
              Work in Neural Space
            </Button>
          </Link>

          <a href={colabUrl} target="_blank" rel="noreferrer noopener" className="block">
            <Button variant="ghost" className="h-14 w-full justify-start gap-2 border border-border text-left">
              <ExternalLink size={18} />
              Work in Google Colab
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
