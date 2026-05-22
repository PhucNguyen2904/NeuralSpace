"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { getWorkspaceAccessToken } from "@/lib/api/workspaces";

interface WorkspaceIframeProps {
  workspaceId: string;
  accessUrl: string;
  wsToken?: string;
}

type ConnectionState = "connected" | "reconnecting" | "disconnected";

export function WorkspaceIframe({ workspaceId, accessUrl, wsToken }: WorkspaceIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [token, setToken] = useState(wsToken ?? "");
  const [expiresAt, setExpiresAt] = useState<number>(Date.now() + 10 * 60_000);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>("reconnecting");

  const iframeUrl = useMemo(() => `${accessUrl}?token=${encodeURIComponent(token)}&theme=light`, [accessUrl, token]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const res = await getWorkspaceAccessToken(workspaceId);
      if (!mounted) return;
      setToken(res.ws_token);
      setExpiresAt(Date.now() + res.expires_in * 1000);
      setConnectionState("reconnecting");
    };
    init();
    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      const msLeft = expiresAt - Date.now();
      if (msLeft <= 60_000) {
        setConnectionState("reconnecting");
        const res = await getWorkspaceAccessToken(workspaceId);
        setToken(res.ws_token);
        setExpiresAt(Date.now() + res.expires_in * 1000);
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "NEURALSPACE_REFRESH_TOKEN",
            payload: { token: res.ws_token }
          },
          "*"
        );
      }
    }, 15_000);

    return () => clearInterval(refreshInterval);
  }, [expiresAt, workspaceId]);

  useEffect(() => {
    const connectionInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/status", { method: "GET" });
        setConnectionState(response.ok ? "connected" : "reconnecting");
      } catch {
        setConnectionState("disconnected");
      }
    }, 15_000);

    return () => clearInterval(connectionInterval);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "NEURALSPACE_OPEN_FILE" && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(event.data, "*");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const retryConnection = async () => {
    setConnectionState("reconnecting");
    const res = await getWorkspaceAccessToken(workspaceId);
    setToken(res.ws_token);
    setExpiresAt(Date.now() + res.expires_in * 1000);
    setIsLoading(true);
  };

  return (
    <div className="relative h-full w-full bg-bg-sunken">
      {token ? (
        <iframe
          ref={iframeRef}
          key={token}
          src={iframeUrl}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          onLoad={() => {
            setIsLoading(false);
            setConnectionState("connected");
            iframeRef.current?.contentWindow?.postMessage(
              {
                type: "NEURALSPACE_THEME_OVERRIDE",
                payload: {
                  fontFamily: "Inter, ui-sans-serif, system-ui",
                  toolbarBackground: "#FFFFFF",
                  hideItems: ["jp-running-sessions", "jp-help-menu"]
                }
              },
              "*"
            );
          }}
        />
      ) : null}

      {isLoading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-base/80">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner /> Kết nối tới workspace...
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-3 right-3 z-30 rounded-full border border-border bg-bg-surface px-3 py-1 text-xs shadow-sm">
        {connectionState === "connected" ? <span className="inline-flex items-center gap-1 text-success-500"><CheckCircle2 size={12} /> Connected · WebSocket active</span> : null}
        {connectionState === "reconnecting" ? <span className="inline-flex items-center gap-1 text-warning-500"><Loader2 size={12} className="animate-spin" /> Reconnecting...</span> : null}
        {connectionState === "disconnected" ? <span className="inline-flex items-center gap-1 text-error-500"><AlertCircle size={12} /> Disconnected <Button size="sm" variant="ghost" onClick={retryConnection}>Retry</Button></span> : null}
      </div>
    </div>
  );
}
