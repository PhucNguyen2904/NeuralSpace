export interface JupyterConfig {
  baseUrl: string;
  wsUrl: string;
  token: string;
}

const baseUrl = process.env.NEXT_PUBLIC_JUPYTER_URL ?? "http://localhost:8888";
const token = process.env.NEXT_PUBLIC_JUPYTER_TOKEN ?? "collabclone-dev-token";

const wsUrl = baseUrl
  .replace(/^https:\/\//i, "wss://")
  .replace(/^http:\/\//i, "ws://");

export const JUPYTER_CONFIG: JupyterConfig = {
  baseUrl,
  wsUrl,
  token
};

/**
 * Build an absolute Jupyter REST URL from an API path.
 */
export function getRestUrl(path: string): string {
  return `${JUPYTER_CONFIG.baseUrl}${path}`;
}

/**
 * Build a kernel channels WebSocket URL with session and auth token.
 */
export function getWsUrl(kernelId: string, sessionId: string): string {
  const encodedKernelId = encodeURIComponent(kernelId);
  const encodedSessionId = encodeURIComponent(sessionId);
  const encodedToken = encodeURIComponent(JUPYTER_CONFIG.token);

  return `${JUPYTER_CONFIG.wsUrl}/api/kernels/${encodedKernelId}/channels?session_id=${encodedSessionId}&token=${encodedToken}`;
}

/**
 * Return default headers for Jupyter REST API calls.
 */
export function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `token ${JUPYTER_CONFIG.token}`,
    "Content-Type": "application/json"
  };
}
