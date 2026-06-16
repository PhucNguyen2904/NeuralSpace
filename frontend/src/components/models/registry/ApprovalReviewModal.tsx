import { useState } from "react";
import { MetricDelta, StageBadge, VersionTag } from "@/components/shared";
import { Button, Modal } from "@/components/ui";
import { useReviewApproval, type ApprovalRequest } from "@/lib/hooks/useModelRegistry";

interface ApprovalReviewModalProps {
  open: boolean;
  onClose: () => void;
  request: ApprovalRequest | null;
}

export function ApprovalReviewModal({ open, onClose, request }: ApprovalReviewModalProps) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");
  const review = useReviewApproval();
  if (!request) return null;

  const submit = async () => {
    await review.mutateAsync({ requestId: request.id, decision, note });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review Approval Request"
      showCloseButton
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={review.isPending} disabled={decision === "reject" && !note.trim()}>
            Submit Decision
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-border p-3">
          <p className="font-medium">{request.model} {request.version}</p>
          <p className="text-text-secondary">Target: {request.targetStage} · Requested by {request.requestedBy} · {request.requestedAgo}</p>
          <p className="mt-1 text-text-secondary">Reason: "{request.reason}"</p>
        </div>

        <div className="rounded-md border border-border p-3">
          <p className="mb-2 font-medium">Metrics comparison</p>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <strong>Metric</strong><strong>New</strong><strong>Current</strong><strong>Delta</strong>
            <span>accuracy</span><span>{request.metrics.accuracyNew}</span><span>{request.metrics.accuracyCurrent}</span><MetricDelta value={request.metrics.accuracyNew} baseline={request.metrics.accuracyCurrent} format="percent" />
            <span>loss</span><span>{request.metrics.lossNew}</span><span>{request.metrics.lossCurrent}</span><MetricDelta value={request.metrics.lossNew} baseline={request.metrics.lossCurrent} format="absolute" higherIsBetter={false} />
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <p className="mb-1 font-medium">Dataset lineage</p>
          <div className="flex items-center gap-2">
            <VersionTag version={request.dataset.version} />
            <span>{request.dataset.name}</span>
            <StageBadge stage={request.dataset.status === "validated" ? "Production" : "None"} size="sm" />
          </div>
        </div>

        <div>
          <p className="mb-1 font-medium">Decision</p>
          <div className="mb-2 flex gap-4">
            <label><input type="radio" checked={decision === "approve"} onChange={() => setDecision("approve")} /> Approve</label>
            <label><input type="radio" checked={decision === "reject"} onChange={() => setDecision("reject")} /> Reject</label>
          </div>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={decision === "reject" ? "Note is required when rejecting" : "Optional note"}
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </div>
      </div>
    </Modal>
  );
}
