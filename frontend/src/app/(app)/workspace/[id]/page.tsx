import { redirect } from "next/navigation";

interface WorkspaceAliasPageProps {
  params: { id: string };
}

export default function WorkspaceAliasPage({ params }: WorkspaceAliasPageProps) {
  redirect(`/workspaces/${params.id}`);
}
