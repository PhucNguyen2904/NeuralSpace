"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { NotebookEditor } from "@/components/notebook/NotebookEditor";

interface WorkspaceNeuralSpacePageProps {
  params: { id: string };
}

export default function WorkspaceNeuralSpacePage({ params }: WorkspaceNeuralSpacePageProps): JSX.Element {
  const searchParams = useSearchParams();
  const requestedFile = searchParams.get("file");
  const notebookPath = normalizeWorkspaceNotebookPath(params.id, requestedFile);

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-0 flex-col pb-10 md:pb-0">
      <div className="mb-2 flex items-center justify-between px-2">
        <Link
          href={`/workspaces/${params.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        >
          <ChevronLeft size={14} />
          Chọn môi trường
        </Link>
        <span className="rounded border border-border bg-bg-surface px-2 py-1 text-[11px] text-text-tertiary">
          File: {notebookPath}
        </span>
      </div>
      <NotebookEditor workspaceId={params.id} notebookPath={notebookPath} />
    </div>
  );
}

function normalizeWorkspaceNotebookPath(workspaceId: string, requestedFile: string | null): string {
  const fallback = `${workspaceId}/main.ipynb`;
  if (!requestedFile || requestedFile.trim().length === 0) {
    return fallback;
  }

  const raw = requestedFile.replace(/^\/+/, "");
  const withoutNotebooksPrefix = raw.startsWith("notebooks/") ? raw.slice("notebooks/".length) : raw;
  if (withoutNotebooksPrefix.startsWith(`${workspaceId}/`)) {
    return withoutNotebooksPrefix;
  }

  const fileName = withoutNotebooksPrefix.split("/").pop();
  if (!fileName) {
    return fallback;
  }
  return `${workspaceId}/${fileName}`;
}
