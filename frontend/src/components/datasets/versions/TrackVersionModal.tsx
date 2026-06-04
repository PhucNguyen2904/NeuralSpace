import { useState } from "react";
import { AlertTriangle, FolderOpen } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { TrackProgressUI } from "@/components/datasets/versions/TrackProgressUI";
import type { UseTrackVersionReturn } from "@/lib/hooks/useDatasetVersions";

interface TrackVersionModalProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
  tracker: UseTrackVersionReturn;
}

export function TrackVersionModal({ open, onClose, datasetId, tracker }: TrackVersionModalProps) {
  const [changelog, setChangelog] = useState("");
  const [path, setPath] = useState("/workspace/datasets/coco2017/");

  const submit = async () => {
    await tracker.trackVersion({ datasetId, changelog, path });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Track New Dataset Version"
      showCloseButton
      size="lg"
      closeOnBackdrop={!tracker.isTracking}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={tracker.isTracking}>
            Hủy
          </Button>
          <Button onClick={() => void submit()} disabled={!changelog.trim()} loading={tracker.isTracking}>
            Track Version
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Changelog <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={changelog}
            onChange={(event) => setChangelog(event.target.value)}
            placeholder="Mô tả thay đổi so với version trước..."
            className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Data path (trong workspace)</label>
          <div className="flex items-center gap-2">
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              className="h-9 flex-1 rounded-md border border-border bg-bg-surface px-3 text-sm"
            />
            <Button size="sm" variant="outline">
              <FolderOpen size={14} />
              Browse
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-bg-elevated p-3 text-sm">
          <p className="font-medium">Preview sẽ track</p>
          <p className="mt-1">📁 coco2017/</p>
          <p className="text-text-secondary">├── images/ (118,287 files, 18.2 GB)</p>
          <p className="text-text-secondary">└── annotations/ (3 files, 245 MB)</p>
          <p className="mt-1 font-medium">Tổng: 18.4 GB</p>
        </div>

        <p className="flex items-center gap-2 text-sm text-amber-700">
          <AlertTriangle size={14} />
          Quá trình track có thể mất 2-5 phút
        </p>

        {tracker.progressSteps.length > 0 ? <TrackProgressUI steps={tracker.progressSteps} /> : null}
      </div>
    </Modal>
  );
}
