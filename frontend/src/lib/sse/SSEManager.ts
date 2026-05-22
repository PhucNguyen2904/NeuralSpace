export interface IdleWarningEvent {
  workspaceId: string;
  minutesLeft: number;
}

export interface WorkspaceKilledEvent {
  workspaceId: string;
  reason?: string;
}

export interface StatusChangeEvent {
  workspaceId: string;
  status: string;
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
    return new EventSource(`/api/v1/workspaces/${workspaceId}/events`);
  }

  private bindEvents(workspaceId: string, entry: ConnectionEntry) {
    const notify = (cb: (handlers: SSEHandlers) => void) => {
      entry.handlers.forEach((handler) => cb(handler));
    };

    entry.source.onopen = () => {
      entry.retryAttempt = 0;
    };

    entry.source.onmessage = (event) => {
      let parsed: { type?: string; payload?: unknown } = {};
      try {
        parsed = JSON.parse(event.data) as { type?: string; payload?: unknown };
      } catch {
        return;
      }

      if (parsed.type === "IDLE_WARNING") {
        notify((handler) => handler.onIdleWarning?.(parsed.payload as IdleWarningEvent));
      }
      if (parsed.type === "WORKSPACE_KILLED") {
        notify((handler) => handler.onWorkspaceKilled?.(parsed.payload as WorkspaceKilledEvent));
      }
      if (parsed.type === "STATUS_CHANGE") {
        notify((handler) => handler.onStatusChange?.(parsed.payload as StatusChangeEvent));
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
