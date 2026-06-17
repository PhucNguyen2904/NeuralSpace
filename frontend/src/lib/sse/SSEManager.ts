export interface IdleWarningEvent {
  workspaceId: string;
  minutesLeft: number;
  message?: string;
}

export interface WorkspaceKilledEvent {
  workspaceId: string;
  reason?: string;
  message?: string;
}

export interface StatusChangeEvent {
  workspaceId: string;
  status: string;
  message?: string;
  accessUrl?: string;
}

export interface SSEHandlers {
  onIdleWarning?: (data: IdleWarningEvent) => void;
  onWorkspaceKilled?: (data: WorkspaceKilledEvent) => void;
  onStatusChange?: (data: StatusChangeEvent) => void;
  onError?: (error: Event) => void;
}

interface ConnectionEntry {
  source: EventSource;
  handlers: Set<SSEHandlers>;
  retryAttempt: number;
  disposed: boolean;
  shouldResume: boolean;
}

class SSEManager {
  private static instance: SSEManager;
  private connections = new Map<string, ConnectionEntry>();

  private constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  static getInstance() {
    if (!SSEManager.instance) {
      SSEManager.instance = new SSEManager();
    }
    return SSEManager.instance;
  }

  subscribe(workspaceId: string, handlers: SSEHandlers): () => void {
    const existing = this.connections.get(workspaceId);
    if (existing) {
      existing.handlers.add(handlers);
      return () => this.removeHandler(workspaceId, handlers);
    }

    const source = this.createEventSource(workspaceId);
    const entry: ConnectionEntry = {
      source,
      handlers: new Set([handlers]),
      retryAttempt: 0,
      disposed: false,
      shouldResume: true
    };

    this.bindEvents(workspaceId, entry);
    this.connections.set(workspaceId, entry);

    return () => this.removeHandler(workspaceId, handlers);
  }

  unsubscribe(workspaceId: string): void {
    const entry = this.connections.get(workspaceId);
    if (!entry) return;

    entry.disposed = true;
    entry.handlers.clear();
    entry.source.close();
    this.connections.delete(workspaceId);
  }

  private removeHandler(workspaceId: string, handlers: SSEHandlers) {
    const entry = this.connections.get(workspaceId);
    if (!entry) return;

    entry.handlers.delete(handlers);
    if (entry.handlers.size === 0) {
      this.unsubscribe(workspaceId);
    }
  }

  private createEventSource(workspaceId: string) {
    const token = this.readToken();
    const query = token ? `?access_token=${encodeURIComponent(token)}` : "";
    return new EventSource(`/api/v1/workspaces/${workspaceId}/events${query}`);
  }

  private readToken() {
    if (typeof window === "undefined") return "";
    const cookieToken = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("auth_token="))
      ?.split("=")[1];
    if (cookieToken) return decodeURIComponent(cookieToken);

    const storeRaw = window.localStorage.getItem("neuralspace-auth");
    if (!storeRaw) return "";
    try {
      const parsed = JSON.parse(storeRaw) as { state?: { token?: string | null } };
      return parsed.state?.token ?? "";
    } catch {
      return "";
    }
  }

  private bindEvents(workspaceId: string, entry: ConnectionEntry) {
    const notify = (cb: (handlers: SSEHandlers) => void) => {
      entry.handlers.forEach((handler) => cb(handler));
    };

    entry.source.onopen = () => {
      entry.retryAttempt = 0;
    };

    entry.source.onmessage = (event) => {
      let parsed: { type?: string; payload?: unknown; workspace_id?: string; workspaceId?: string; minutes_left?: number; minutesLeft?: number; status?: string; message?: string; access_url?: string; accessUrl?: string; reason?: string } = {};
      try {
        parsed = JSON.parse(event.data) as typeof parsed;
      } catch {
        return;
      }

      const payload =
        parsed.payload && typeof parsed.payload === "object"
          ? (parsed.payload as Record<string, unknown>)
          : parsed;
      const eventWorkspaceId = String(payload.workspaceId ?? payload.workspace_id ?? workspaceId);
      const message = typeof payload.message === "string" ? payload.message : undefined;

      if (parsed.type === "IDLE_WARNING") {
        notify((handler) =>
          handler.onIdleWarning?.({
            workspaceId: eventWorkspaceId,
            minutesLeft: Number(payload.minutesLeft ?? payload.minutes_left ?? 0),
            message
          })
        );
      }
      if (parsed.type === "WORKSPACE_KILLED") {
        notify((handler) =>
          handler.onWorkspaceKilled?.({
            workspaceId: eventWorkspaceId,
            reason: typeof payload.reason === "string" ? payload.reason : undefined,
            message
          })
        );
      }
      if (parsed.type === "STATUS_CHANGE" || parsed.type === "WORKSPACE_STARTED") {
        notify((handler) =>
          handler.onStatusChange?.({
            workspaceId: eventWorkspaceId,
            status: parsed.type === "WORKSPACE_STARTED" ? "RUNNING" : String(payload.status ?? ""),
            message,
            accessUrl: typeof payload.accessUrl === "string" ? payload.accessUrl : typeof payload.access_url === "string" ? payload.access_url : undefined
          })
        );
      }
    };

    entry.source.onerror = (event) => {
      notify((handler) => handler.onError?.(event));
      entry.source.close();
      if (!entry.disposed && entry.shouldResume) {
        this.reconnect(workspaceId, entry.retryAttempt + 1);
      }
    };
  }

  private reconnect(workspaceId: string, attempt: number): void {
    const entry = this.connections.get(workspaceId);
    if (!entry || entry.disposed || !entry.shouldResume) return;
    if (attempt > 5) return;

    entry.retryAttempt = attempt;
    const delay = 1000 * Math.pow(2, attempt - 1);

    setTimeout(() => {
      const current = this.connections.get(workspaceId);
      if (!current || current.disposed || !current.shouldResume) return;

      current.source = this.createEventSource(workspaceId);
      this.bindEvents(workspaceId, current);
    }, delay);
  }

  private handleVisibilityChange = () => {
    const hidden = document.visibilityState === "hidden";

    this.connections.forEach((entry, workspaceId) => {
      if (hidden) {
        entry.shouldResume = false;
        entry.source.close();
      } else {
        if (!entry.disposed) {
          entry.shouldResume = true;
          entry.source = this.createEventSource(workspaceId);
          this.bindEvents(workspaceId, entry);
        }
      }
    });
  };
}

export const sseManager = SSEManager.getInstance();
