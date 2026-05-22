"use client";

import { AlertTriangle } from "lucide-react";
import { Button, Modal } from "@/components/ui";

interface DeleteConfirmModalProps {
  open: boolean;
  confirmChecked: boolean;
  setConfirmChecked: (checked: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
}

export function DeleteConfirmModal({
  open,
  confirmChecked,
  setConfirmChecked,
  onClose,
  onConfirm,
  deleting
}: DeleteConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={<span className="flex items-center gap-2"><AlertTriangle className="text-error-500" size={18} /> Xóa workspace?</span>}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button variant="danger" onClick={onConfirm} disabled={!confirmChecked} loading={deleting}>Xóa vĩnh viễn</Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">Hành động này không thể hoàn tác. Notebooks sẽ được lưu lại.</p>
      <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" className="h-4 w-4 rounded border-border" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
        Tôi hiểu và muốn xóa
      </label>
    </Modal>
  );
}
