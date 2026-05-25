import axios from "axios";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "/api/v1",
  timeout: 10000
});

apiClient.interceptors.request.use((config) => {
  if (typeof window === "undefined") return config;

  const cookieToken = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("auth_token="))
    ?.split("=")[1];

  const storeRaw = window.localStorage.getItem("neuralspace-auth");
  let storeToken: string | null = null;
  if (storeRaw) {
    try {
      const parsed = JSON.parse(storeRaw) as { state?: { token?: string } };
      storeToken = parsed?.state?.token ?? null;
    } catch {
      storeToken = null;
    }
  }

  const token = cookieToken ? decodeURIComponent(cookieToken) : storeToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
