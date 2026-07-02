import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { PreflightChecks } from "@/components/models/registry/PreflightChecks";
import { usePromoteModel, useRealtimePreflight } from "@/lib/hooks/useModelRegistry";
import { useToast } from "@/lib/hooks/useToast";

interface PromoteModalProps {
  open: boolean;
  onClose: () => void;
  modelName: string;
  version: string;
  currentStage: string;
  accuracy: number;
  loss: number;
}

export function PromoteModal({ open, onClose, modelName, version, currentStage, accuracy, loss }: PromoteModalProps) {
  const { toast } = useToast();
  const [target, setTarget] = useState<"Staging" | "Production">("Production");
  const promote = usePromoteModel();
  const checks = useRealtimePreflight(target, { accuracy, loss });

  // Prevent promoting to same stage
  const stageOptions: Array<"Staging" | "Production"> = ["Staging", "Production"].filter(
    (s) => s !== currentStage
  ) as Array<"Staging" | "Production">;

  const submit = async () => {
    try {
      await promote.mutateAsync({ modelName, version, targetStage: target });
      toast.success(`Model ${version} promoted to ${target}`);
      onClose();
    } catch {
      toast.error("Failed to promote model. Please try again.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Promote Model Version"
      showCloseButton
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={promote.isPending}>Cancel</Button>
          <Button
            onClick={() => void submit()}
            loading={promote.isPending}
            className="bg-violet-600 text-white hover:bg-violet-500"
          >
            Promote to {target}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {stageOptions.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Step 1 — Select target stage</p>
            <div className="flex gap-4 text-sm">
              {stageOptions.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={target === s} onChange={() => setTarget(s)} />
                  {s}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This version is already in <strong>{currentStage}</strong>. Archive it first to move it elsewhere.
          </div>
        )}

        <div>
          <p className="mb-1 text-sm font-medium">Step 2 — Pre-flight checks</p>
          <PreflightChecks checks={checks} />
        </div>

        <div className="rounded-md border border-border bg-bg-elevated/50 p-3 text-sm text-text-secondary">
          <p>Promoting <strong className="text-text-primary">{version}</strong> → <strong className="text-text-primary">{target}</strong>.</p>
          <p className="mt-1">This will immediately update the stage in the Model Registry. The change takes effect right away.</p>
        </div>
      </div>
    </Modal>
  );
}
