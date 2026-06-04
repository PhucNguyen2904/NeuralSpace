"use client";

import { useState } from "react";
import { ApprovalReviewModal } from "@/components/models/registry/ApprovalReviewModal";
import { usePendingApprovals, type ApprovalRequest } from "@/lib/hooks/useModelRegistry";

export default function ApprovalsPage() {
  const approvals = usePendingApprovals();
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Approval Requests</h1>
        <p className="text-sm text-text-secondary">Visible cho role `model_approver`/`admin`.</p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-surface">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-tertiary">
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Requested By</th>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {(approvals.data ?? []).map((item) => (
              <tr key={item.id} className="border-b border-border/70">
                <td className="px-3 py-2">{item.model}</td>
                <td className="px-3 py-2">{item.version}</td>
                <td className="px-3 py-2">{item.targetStage}</td>
                <td className="px-3 py-2">{item.requestedBy}</td>
                <td className="px-3 py-2">{item.requestedAgo}</td>
                <td className="px-3 py-2">
                  <button className="text-brand-600 hover:underline" onClick={() => setSelected(item)}>Review</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ApprovalReviewModal open={Boolean(selected)} onClose={() => setSelected(null)} request={selected} />
    </div>
  );
}
