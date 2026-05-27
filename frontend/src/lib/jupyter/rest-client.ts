import { JUPYTER_CONFIG, type JupyterConfig } from "./config";
import type { JupyterContentsItem, JupyterKernel, NotebookContent } from "./types";

interface JupyterStatusResponse {
  started: string;
  last_activity: string;
}

interface JupyterContentsResponse {
  content: NotebookContent | string;
}

interface JupyterSaveResponse {
  path: string;
  type: string;
  last_modified?: string;
}

interface NotebookLoadResult {
  content: NotebookContent;
  resolvedPath: string;
}

interface JupyterDirectoryResponse {
  content: JupyterContentsItem[];
}

export class JupyterApiError extends Error {
  status: number;
  endpoint: string;

  constructor(status: number, message: string, endpoint: string) {
    super(message);
    this.name = "JupyterApiError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

export class JupyterRestClient {
  private readonly config: JupyterConfig;

  constructor(config: JupyterConfig = JUPYTER_CONFIG) {
    this.config = config;
  }

  /**
   * List all running kernels.
   */
  async listKernels(): Promise<JupyterKernel[]> {
    return this.request<JupyterKernel[]>("/api/kernels", { method: "GET" });
  }

  /**
   * Fetch a kernel by id.
   */
  async getKernel(kernelId: string): Promise<JupyterKernel> {
    return this.request<JupyterKernel>(`/api/kernels/${encodeURIComponent(kernelId)}`, {
      method: "GET"
    });
  }

  /**
   * Start a new kernel.
   */
  async startKernel(name = "python3"): Promise<JupyterKernel> {
    return this.request<JupyterKernel>("/api/kernels", {
      method: "POST",
      body: JSON.stringify({ name })
    });
  }

  /**
   * Shut down a running kernel.
   */
  async shutdownKernel(kernelId: string): Promise<void> {
    await this.request<void>(`/api/kernels/${encodeURIComponent(kernelId)}`, {
      method: "DELETE"
    });
  }

  /**
   * Restart a running kernel.
   */
  async restartKernel(kernelId: string): Promise<JupyterKernel> {
    return this.request<JupyterKernel>(`/api/kernels/${encodeURIComponent(kernelId)}/restart`, {
      method: "POST"
    });
  }

  /**
   * Interrupt a running kernel execution.
   */
  async interruptKernel(kernelId: string): Promise<void> {
    await this.request<void>(`/api/kernels/${encodeURIComponent(kernelId)}/interrupt`, {
      method: "POST"
    });
  }

  /**
   * Load notebook content by path.
   */
  async getNotebook(path: string): Promise<NotebookLoadResult> {
    const response = await this.getNotebookRaw(path);
    const content =
      typeof response.content === "string"
        ? (JSON.parse(response.content) as NotebookContent)
        : response.content;

    return {
      content,
      resolvedPath: response.resolvedPath
    };
  }

  /**
   * Save notebook content to path.
   */
  async saveNotebook(path: string, content: NotebookContent): Promise<void> {
    const encodedPath = encodePath(path);
    const requestBody = JSON.stringify({
      type: "notebook",
      format: "json",
      content
    });
    // FIX [BƯỚC 2]: Diagnostic logs for save path/status/body size to catch proxy/header/body issues.
    console.info("[NotebookSave] PUT request", {
      requestPath: path,
      encodedPath,
      bytes: requestBody.length
    });
    const response = await this.request<JupyterSaveResponse>(`/api/contents/${encodedPath}`, {
      method: "PUT",
      body: requestBody
    });
    // FIX [BƯỚC 2]: Validate Jupyter save response to prevent false-success UI state.
    if (response.type !== "notebook" || typeof response.path !== "string") {
      throw new JupyterApiError(500, "Unexpected Jupyter save response payload", `${this.config.baseUrl}/api/contents/${encodedPath}`);
    }
    console.info("[NotebookSave] PUT success", {
      responsePath: response.path,
      responseType: response.type,
      lastModified: response.last_modified ?? null
    });
  }

  /**
   * Delete notebook/file from Jupyter contents API.
   */
  async deleteNotebook(path: string): Promise<void> {
    const encodedPath = encodePath(path);
    await this.request<void>(`/api/contents/${encodedPath}`, {
      method: "DELETE"
    });
  }

  /**
   * Ensure a directory exists at path.
   */
  async ensureDirectory(path: string): Promise<void> {
    const encodedPath = encodePath(path);
    if (!encodedPath) {
      return;
    }

    try {
      await this.request<void>(`/api/contents/${encodedPath}`, {
        method: "PUT",
        body: JSON.stringify({
          type: "directory"
        })
      });
    } catch (error) {
      if (error instanceof JupyterApiError && error.status === 409) {
        return;
      }
      throw error;
    }
  }

  /**
   * List directory items for a Jupyter contents path.
   */
  async listDirectory(path = ""): Promise<JupyterContentsItem[]> {
    const encodedPath = encodePath(path);
    const suffix = encodedPath.length > 0 ? `/${encodedPath}` : "";
    const response = await this.request<JupyterDirectoryResponse>(
      `/api/contents${suffix}?content=1&type=directory`,
      { method: "GET" }
    );

    return response.content;
  }

  /**
   * Fetch server status metadata.
   */
  async getServerStatus(): Promise<JupyterStatusResponse> {
    return this.request<JupyterStatusResponse>("/api/status", { method: "GET" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const endpoint = `${this.config.baseUrl}${path}`;
    const method = (init.method ?? "GET").toUpperCase();
    const xsrfToken = typeof document !== "undefined" ? getCookieValue("_xsrf") : null;
    const extraHeaders: Record<string, string> = {};
    // FIX [BƯỚC 5]: Attach XSRF token on mutating requests when Jupyter requires it.
    if (method !== "GET" && method !== "HEAD" && xsrfToken) {
      extraHeaders["X-XSRFToken"] = xsrfToken;
    }

    const response = await fetch(endpoint, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: {
        Authorization: `token ${this.config.token}`,
        "Content-Type": "application/json",
        Pragma: "no-cache",
        "Cache-Control": "no-cache, no-store, max-age=0",
        ...extraHeaders,
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new JupyterApiError(response.status, message, endpoint);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async getNotebookRaw(path: string): Promise<JupyterContentsResponse & { resolvedPath: string }> {
    const encodedPath = encodePath(path);
    const cacheBuster = Date.now();
    const data = await this.request<JupyterContentsResponse>(
      `/api/contents/${encodedPath}?content=1&type=notebook&_=${cacheBuster}`,
      { method: "GET" }
    );
    return { ...data, resolvedPath: path };
  }
}

function encodePath(path: string): string {
  if (path.trim().length === 0) {
    return "";
  }

  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text.length === 0) {
      return response.statusText || "Jupyter API request failed";
    }
    try {
      const data = JSON.parse(text) as { message?: string; reason?: string };
      return data.message ?? data.reason ?? text;
    } catch {
      return text;
    }
  } catch {
    return response.statusText || "Jupyter API request failed";
  }
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const cookies = document.cookie.split(";").map((part) => part.trim());
  const target = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!target) {
    return null;
  }
  const [, value] = target.split("=");
  try {
    return decodeURIComponent(value);
  } catch {
    return value ?? null;
  }
}
