import axios from "axios";
import type { AxiosResponse } from "axios";

function resolveApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!configured) return "/api/v1";
  return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60s – DVC operations (clone, push) can be slow
  paramsSerializer: {
    indexes: null
  }
});

export async function unwrapResponse<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
  return (await request).data;
}

type AuthStoreSnapshot = {
  state?: {
    token?: string | null;
  };
};

type RetriableConfig = {
  _retry?: boolean;
  metadata?: { startTime?: number };
};

function readAuthState() {
  if (typeof window === "undefined") return { token: null as string | null };
  const storeRaw = window.localStorage.getItem("neuralspace-auth");
  if (!storeRaw) return { token: null };
  try {
    const parsed = JSON.parse(storeRaw) as AuthStoreSnapshot;
    return {
      token: parsed?.state?.token ?? null
    };
  } catch {
    return { token: null };
  }
}

apiClient.interceptors.request.use((config) => {
  if (typeof window === "undefined") return config;

  const cookieToken = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("auth_token="))
    ?.split("=")[1];

  const { token: storeToken } = readAuthState();

  const token = cookieToken ? decodeURIComponent(cookieToken) : storeToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  (config as typeof config & RetriableConfig).metadata = { startTime: Date.now() };

  return config;
});

apiClient.interceptors.response.use(
  async (response) => {
    const cfg = response.config as typeof response.config & RetriableConfig;
    const start = cfg.metadata?.startTime;
    if (start) {
      const ms = Date.now() - start;
      if (ms > 800 && typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn(`[API slow] ${response.config.method?.toUpperCase()} ${response.config.url} ${ms}ms`);
      }
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const originalConfig = error.config as typeof error.config & RetriableConfig;
    if (status === 401 && originalConfig && !originalConfig._retry && typeof window !== "undefined") {
      originalConfig._retry = true;
      try {
        const refreshResponse = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { timeout: 10000 }
        );
        const nextAccessToken = refreshResponse.data?.access_token as string | undefined;
        const nextExpiresIn = Number(refreshResponse.data?.expires_in ?? 0);
        if (!nextAccessToken) {
          return Promise.reject(error);
        }

        const storeRaw = window.localStorage.getItem("neuralspace-auth");
        if (storeRaw) {
          try {
            const parsed = JSON.parse(storeRaw) as AuthStoreSnapshot;
            const next = {
              ...parsed,
              state: {
                ...(parsed.state ?? {}),
                token: nextAccessToken
              }
            };
            window.localStorage.setItem("neuralspace-auth", JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        document.cookie = `auth_token=${encodeURIComponent(nextAccessToken)}; Path=/; Max-Age=${Math.max(0, nextExpiresIn)}; SameSite=Lax`;
        originalConfig.headers = originalConfig.headers ?? {};
        originalConfig.headers.Authorization = `Bearer ${nextAccessToken}`;
        return apiClient(originalConfig);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
