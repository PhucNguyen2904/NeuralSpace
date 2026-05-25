import { JUPYTER_CONFIG, type JupyterConfig } from "./config";
import type { JupyterContentsItem, JupyterKernel, NotebookContent } from "./types";

interface JupyterStatusResponse {
  started: string;
  last_activity: string;
}

interface JupyterContentsResponse {
  content: NotebookContent | string;
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
  async getNotebook(path: string): Promise<NotebookContent> {
    const encodedPath = encodePath(path);
    const response = await this.request<JupyterContentsResponse>(
      `/api/contents/${encodedPath}?content=1&type=notebook`,
      { method: "GET" }
    );

    if (typeof response.content === "string") {
      return JSON.parse(response.content) as NotebookContent;
    }

    return response.content;
  }

  /**
   * Save notebook content to path.
   */
  async saveNotebook(path: string, content: NotebookContent): Promise<void> {
    const encodedPath = encodePath(path);
    await this.request<void>(`/api/contents/${encodedPath}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "notebook",
        format: "json",
        content
      })
    });
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
    const response = await fetch(endpoint, {
      ...init,
      headers: {
        Authorization: `token ${this.config.token}`,
        "Content-Type": "application/json",
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
    const data = (await response.json()) as { message?: string; reason?: string };
    return data.message ?? data.reason ?? response.statusText;
  } catch {
    return response.statusText || "Jupyter API request failed";
  }
}
