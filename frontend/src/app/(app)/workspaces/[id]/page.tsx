"use client";

import { NotebookEditor } from "@/components/notebook/NotebookEditor";

interface WorkspaceIdePageProps {
  params: { id: string };
}

export default function WorkspaceIdePage({ params }: WorkspaceIdePageProps): JSX.Element {
  return (
    <NotebookEditor
      workspaceId={params.id}
      notebookPath={`${params.id}/main.ipynb`}
    />
  );
}
