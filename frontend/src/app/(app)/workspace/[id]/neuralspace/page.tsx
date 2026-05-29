import { redirect } from "next/navigation";

interface WorkspaceAliasNeuralspacePageProps {
  params: { id: string };
}

export default function WorkspaceAliasNeuralspacePage({
  params
}: WorkspaceAliasNeuralspacePageProps) {
  redirect(`/workspaces/${params.id}/neuralspace`);
}
