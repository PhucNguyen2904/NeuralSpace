import { PageHeader } from "@/components/shared/PageHeader";
import { Card, Input } from "@/components/ui";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage account and workspace defaults." />
      <Card className="max-w-xl space-y-4" padding="lg">
        <Input label="Display Name" defaultValue="Alex Nguyen" />
        <Input label="Email" defaultValue="alex@neuralspace.dev" />
      </Card>
    </>
  );
}
