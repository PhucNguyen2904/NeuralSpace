import { JUPYTER_CONFIG, type JupyterConfig } from "./config";
import type {
  DisplayDataContent,
  ErrorContent,
  ExecuteReplyContent,
  ExecuteRequestContent,
  ExecuteResultContent,
  JupyterMessage,
  StatusContent,
  StreamContent
} from "./types";

export interface ExecutionCallbacks {
  onStream?: (content: StreamContent) => void;
  onResult?: (content: ExecuteResultContent) => void;
  onDisplayData?: (content: DisplayDataContent) => void;
  onError?: (content: ErrorContent) => void;
  onReply?: (content: { status: "ok" | "error"; execution_count: number }) => void;
}

export interface ExecuteCodeOptions {
  silent?: boolean;
  storeHistory?: boolean;
}

export type KernelWebSocketStatus = "disconnected" | "connecting" | "connected" | "error";

export class KernelWebSocket {
  onStatusChange?: (status: KernelWebSocketStatus) => void;
  onKernelStatusChange?: (executionState: "idle" | "busy" | "starting") => void;

  private ws: WebSocket | null = null;
  private readonly kernelId: string;
  private readonly sessionId: string;
  private readonly config: JupyterConfig;
  private status: KernelWebSocketStatus = "disconnected";
  private readonly pendingCallbacks = new Map<string, ExecutionCallbacks>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  /** True when the first connection attempt failed (server not running). Stops retry loop. */
  private serverUnreachable = false;
  private isInitialConnect = true;

  constructor(kernelId: string, sessionId: string, config: JupyterConfig = JUPYTER_CONFIG) {
    this.kernelId = kernelId;
    this.sessionId = sessionId;
    this.config = config;
  }

  /**
   * Open a WebSocket connection to kernel channels.
   */
  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.setStatus("connecting");

    const encodedKernelId = encodeURIComponent(this.kernelId);
    const encodedSessionId = encodeURIComponent(this.sessionId);
    const encodedToken = encodeURIComponent(this.config.token);
    const url = `${this.config.wsUrl}/api/kernels/${encodedKernelId}/channels?session_id=${encodedSessionId}&token=${encodedToken}`;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.ws = socket;

      const timeoutHandle = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
          reject(new Error(`WebSocket connection timeout after 10000ms: ${url}`));
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(timeoutHandle);
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.serverUnreachable = false;
        this.isInitialConnect = false;
        this.setStatus("connected");
        resolve();
      };

      socket.onmessage = (event) => {
        this.handleMessage(event);
      };

      socket.onerror = () => {
        clearTimeout(timeoutHandle);
        // If this is the very first connection attempt, the server is simply not running.
        // Mark as unreachable so scheduleReconnect skips all retry attempts.
        if (this.isInitialConnect) {
          this.serverUnreachable = true;
        }
        this.setStatus("error");
      };

      socket.onclose = () => {
        clearTimeout(timeoutHandle);
        this.isInitialConnect = false;

        if (this.status !== "error") {
          this.setStatus("disconnected");
        }

        if (!this.intentionalClose && !this.serverUnreachable) {
          this.scheduleReconnect();
        }
      };
    }).catch((error: unknown) => {
      this.setStatus("error");
      throw error instanceof Error ? error : new Error("Unknown WebSocket connection error");
    });
  }

  /**
   * Close the WebSocket connection and clear pending callbacks.
   */
  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.pendingCallbacks.clear();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.setStatus("disconnected");
  }

  /**
   * Send execute_request to the kernel and register callbacks for routed replies.
   */
  executeCode(code: string, callbacks: ExecutionCallbacks, options?: ExecuteCodeOptions): string {
    const msgId = this.generateMsgId();
    const message = this.createExecuteRequest(code, msgId, options);

    this.pendingCallbacks.set(msgId, callbacks);
    this.sendMessage(message);

    return msgId;
  }

  /**
   * Send a raw Jupyter protocol message through the open WebSocket.
   */
  sendMessage<T>(message: JupyterMessage<T>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(event: MessageEvent): void {
    const raw = event.data;
    if (typeof raw !== "string") {
      return;
    }

    let message: JupyterMessage<unknown>;
    try {
      message = JSON.parse(raw) as JupyterMessage<unknown>;
    } catch {
      throw new Error("Failed to parse Jupyter WebSocket message as JSON");
    }

    if (message.header.msg_type === "status" && message.channel === "iopub") {
      const statusContent = message.content as StatusContent;
      this.onKernelStatusChange?.(statusContent.execution_state);
      return;
    }

    const parentMsgId = message.parent_header.msg_id;
    if (!parentMsgId || typeof parentMsgId !== "string") {
      return;
    }

    const callbacks = this.pendingCallbacks.get(parentMsgId);
    if (!callbacks) {
      return;
    }

    switch (message.header.msg_type) {
      case "stream":
        callbacks.onStream?.(message.content as StreamContent);
        break;
      case "execute_result":
        callbacks.onResult?.(message.content as ExecuteResultContent);
        break;
      case "display_data":
        callbacks.onDisplayData?.(message.content as DisplayDataContent);
        break;
      case "error":
        callbacks.onError?.(message.content as ErrorContent);
        break;
      case "execute_reply": {
        const content = message.content as ExecuteReplyContent;
        callbacks.onReply?.({
          status: content.status === "ok" ? "ok" : "error",
          execution_count: content.execution_count
        });
        this.pendingCallbacks.delete(parentMsgId);
        break;
      }
      default:
        break;
    }
  }

  private createExecuteRequest(code: string, msgId: string, options?: ExecuteCodeOptions): JupyterMessage<ExecuteRequestContent> {
    return {
      channel: "shell",
      header: {
        msg_id: msgId,
        msg_type: "execute_request",
        username: "collabclone",
        session: this.sessionId,
        date: new Date().toISOString(),
        version: "5.3"
      },
      parent_header: {},
      metadata: {},
      content: {
        code,
        silent: options?.silent ?? false,
        store_history: options?.storeHistory ?? true,
        user_expressions: {},
        allow_stdin: false,
        stop_on_error: true
      }
    };
  }

  private generateMsgId(): string {
    return crypto.randomUUID();
  }

  private scheduleReconnect(): void {
    // Do not retry if the server was never reachable (avoids ERR_CONNECTION_REFUSED spam)
    if (this.serverUnreachable) {
      this.setStatus("error");
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus("error");
      return;
    }

    const delay = Math.min(this.reconnectDelay * 2 ** this.reconnectAttempts, 30000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts += 1;
      void this.connect().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  private setStatus(nextStatus: KernelWebSocketStatus): void {
    this.status = nextStatus;
    this.onStatusChange?.(nextStatus);
  }
}
