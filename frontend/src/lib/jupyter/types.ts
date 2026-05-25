export interface JupyterKernel {
  id: string;
  name: string;
  last_activity: string;
  execution_state: "idle" | "busy" | "starting" | "dead";
  connections: number;
}

export interface JupyterSession {
  id: string;
  path: string;
  name: string;
  type: string;
  kernel: JupyterKernel;
}

export interface JupyterContentsItem {
  name: string;
  path: string;
  type: "directory" | "notebook" | "file";
  writable: boolean;
  created: string;
  last_modified: string;
  mimetype: string | null;
  content: JupyterContentsItem[] | NotebookContent | string | null;
  format: "json" | "text" | "base64" | null;
}

export interface NotebookContent {
  nbformat: 4;
  nbformat_minor: number;
  metadata: {
    kernelspec: { display_name: string; language: string; name: string };
    language_info: { name: string; version: string };
    [key: string]: unknown;
  };
  cells: NotebookCell[];
}

export type CellType = "code" | "markdown" | "raw";

export interface NotebookCell {
  id: string;
  cell_type: CellType;
  source: string;
  metadata: Record<string, unknown>;
  outputs: CellOutput[];
  execution_count: number | null;
}

export type JupyterMsgType =
  | "execute_request"
  | "kernel_info_request"
  | "interrupt_request"
  | "shutdown_request"
  | "execute_input"
  | "execute_result"
  | "stream"
  | "display_data"
  | "update_display_data"
  | "error"
  | "status"
  | "clear_output"
  | "execute_reply"
  | "kernel_info_reply";

export interface JupyterMessageHeader {
  msg_id: string;
  msg_type: JupyterMsgType;
  username: string;
  session: string;
  date: string;
  version: "5.3";
}

export interface JupyterMessage<T = unknown> {
  header: JupyterMessageHeader;
  parent_header: Partial<JupyterMessageHeader>;
  metadata: Record<string, unknown>;
  content: T;
  buffers?: ArrayBuffer[];
  channel: "shell" | "iopub" | "stdin" | "control";
}

export interface ExecuteRequestContent {
  code: string;
  silent: boolean;
  store_history: boolean;
  user_expressions: Record<string, string>;
  allow_stdin: boolean;
  stop_on_error: boolean;
}

export interface StreamContent {
  name: "stdout" | "stderr";
  text: string;
}

export interface ExecuteResultContent {
  execution_count: number;
  data: MimeBundle;
  metadata: Record<string, unknown>;
}

export interface DisplayDataContent {
  data: MimeBundle;
  metadata: Record<string, unknown>;
  transient?: { display_id?: string };
}

export interface ErrorContent {
  ename: string;
  evalue: string;
  traceback: string[];
}

export interface StatusContent {
  execution_state: "idle" | "busy" | "starting";
}

export interface ExecuteReplyContent {
  status: "ok" | "error" | "abort";
  execution_count: number;
}

export type MimeBundle = {
  "text/plain"?: string;
  "text/html"?: string;
  "text/markdown"?: string;
  "image/png"?: string;
  "image/jpeg"?: string;
  "image/svg+xml"?: string;
  "application/json"?: unknown;
  [key: string]: unknown;
};

export type CellOutput =
  | { output_type: "stream"; name: "stdout" | "stderr"; text: string }
  | {
      output_type: "execute_result";
      execution_count: number;
      data: MimeBundle;
      metadata: Record<string, unknown>;
    }
  | {
      output_type: "display_data";
      data: MimeBundle;
      metadata: Record<string, unknown>;
    }
  | {
      output_type: "error";
      ename: string;
      evalue: string;
      traceback: string[];
    };
