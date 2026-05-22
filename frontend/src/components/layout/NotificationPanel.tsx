"use client";

import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Save, Terminal, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui";
import { useNotificationStore } from "@/lib/stores/notificationStore";

function typeMeta(type: string) {
  switch (type) {
    case "WORKSPACE_RUNNING":
      return { icon: <Terminal size={16} className="text-success-500" />, action: "Open" };
    case "WORKSPACE_KILLED":
      return { icon: <AlertTriangle size={16} className="text-warning-500" />, action: "View" };
    case "WORKSPACE_ERROR":
      return { icon: <XCircle size={16} className="text-error-500" />, action: "View logs" };
    case "SAVE_COMPLETE":
      return { icon: <Save size={16} className="text-success-500" />, action: undefined };
    case "QUOTA_WARNING":
      return { icon: <AlertTriangle size={16} className="text-warning-500" />, action: "Manage" };
    default:
      return { icon: <Terminal size={16} className="text-brand-500" />, action: undefined };
  }
}

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notifications, markAllRead, clearAll, markRead } = useNotificationStore();

  const content = useMemo(() => {
    if (!notifications.length) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-center text-text-secondary">
          <div className="mb-3 text-3xl">🔔</div>
          <p className="text-sm">Không có thông báo nào</p>
        </div>
      );
    }

    return (
      <div className="space-y-2 p-3">
        {notifications.map((item) => {
          const meta = typeMeta(item.type);
          return (
            <div
              key={item.id}
              className={`rounded-md border p-3 ${item.read ? "border-border bg-bg-surface" : "border-brand-500 bg-brand-50/30"}`}
              onClick={() => markRead(item.id)}
            >
              <div className="flex items-start gap-2">
                {meta.icon}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{item.title}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{item.description}</p>
                  <p className="mt-1 text-xs text-text-tertiary">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
                </div>
                {meta.action ? (
                  <Link href={item.workspaceId ? `/workspaces/${item.workspaceId}` : "#"} className="text-xs text-brand-600 hover:underline">
                    {meta.action} →
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [notifications, markRead]);

  return (
    <motion.aside
      initial={false}
      animate={{ x: open ? 0 : 420 }}
      transition={{ duration: 0.25 }}
      className="fixed right-0 top-0 z-[90] h-screen w-[400px] border-l border-border bg-bg-surface shadow-lg"
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <p className="font-semibold text-text-primary">Thông báo</p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={markAllRead}>Đánh dấu tất cả đã đọc</Button>
          <Button size="sm" variant="ghost" onClick={clearAll}>Xóa tất cả</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Đóng</Button>
        </div>
      </div>
      <div className="h-[calc(100vh-56px)] overflow-auto">{content}</div>
    </motion.aside>
  );
}
