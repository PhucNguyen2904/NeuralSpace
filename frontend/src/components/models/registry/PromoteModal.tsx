import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { PreflightChecks } from "@/components/models/registry/PreflightChecks";
import { usePromoteModel, useRealtimePreflight } from "@/lib/hooks/useModelRegistry";

interface PromoteModalProps {
  open: boolean;
  onClose: () => void;
  modelName: string;
  version: string;
  accuracy: number;
  loss: number;
}

export function PromoteModal({ open, onClose, modelName, version, accuracy, loss }: PromoteModalProps) {
  const [target, setTarget] = useState<"Staging" | "Production">("Production");
  const [reason, setReason] = useState("");
  const [reviewers, setReviewers] = useState("@reviewer1, @reviewer2");
  const promote = usePromoteModel();
  const checks = useRealtimePreflight(target, { accuracy, loss });

  const submit = async () => {
    await promote.mutateAsync({
      modelName,
      version,
      targetStage: target,
      reason,
      reviewers: reviewers.split(",").map((item) => item.trim()).filter(Boolean)
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Promote Model Version"
      showCloseButton
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={promote.isPending} disabled={!reason.trim()}>
            {target === "Production" ? "Submit Request" : "Promote"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium">Step 1 - Select target stage</p>
          <div className="flex gap-4 text-sm">
            <label><input type="radio" checked={target === "Staging"} onChange={() => setTarget("Staging")} /> Staging</label>
            <label><input type="radio" checked={target === "Production"} onChange={() => setTarget("Production")} /> Production</label>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">Step 2 — Pre-flight checks</p>
          <PreflightChecks checks={checks} />
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">Step 3 — Request info</p>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Model passed evaluation on the COCO test set"
            className="mb-2 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <input
            value={reviewers}
            onChange={(event) => setReviewers(event.target.value)}
            className="h-9 w-full rounded-md border border-border px-3 text-sm"
          />
        </div>
      </div>
    </Modal>
  );
}
