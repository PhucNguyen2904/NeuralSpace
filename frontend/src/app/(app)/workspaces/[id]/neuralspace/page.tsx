import { redirect } from "next/navigation";

export default function LegacyNeuralSpacePage({ params }: { params: { id: string } }): never {
  redirect(`/workspaces/${params.id}`);
}
