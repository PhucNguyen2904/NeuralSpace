import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  KernelWebSocket,
  type ExecuteCodeOptions,
  type ExecutionCallbacks,
  type KernelWebSocketStatus
} from "../lib/jupyter/kernel-websocket";
import { JupyterRestClient } from "../lib/jupyter/rest-client";
import type { JupyterKernel } from "../lib/jupyter/types";

interface KernelState {
  kernel: JupyterKernel | null;
  kernelStatus: "idle" | "busy" | "starting" | "dead";
  connectionStatus: KernelWebSocketStatus;
  error: string | null;
}

type KernelAction =
  | { type: "SET_KERNEL"; payload: JupyterKernel | null }
  | { type: "SET_KERNEL_STATUS"; payload: KernelState["kernelStatus"] }
  | { type: "SET_CONNECTION_STATUS"; payload: KernelWebSocketStatus }
  | { type: "SET_ERROR"; payload: string | null };

const initialState: KernelState = {
  kernel: null,
  kernelStatus: "starting",
  connectionStatus: "disconnected",
  error: null
};

function reducer(state: KernelState, action: KernelAction): KernelState {
  switch (action.type) {
    case "SET_KERNEL":
      return { ...state, kernel: action.payload };
    case "SET_KERNEL_STATUS":
      return { ...state, kernelStatus: action.payload };
    case "SET_CONNECTION_STATUS":
      return { ...state, connectionStatus: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export interface UseKernelReturn {
  kernel: JupyterKernel | null;
  kernelStatus: "idle" | "busy" | "starting" | "dead";
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  isReady: boolean;
  startKernel: () => Promise<void>;
  restartKernel: () => Promise<void>;
  interruptKernel: () => Promise<void>;
  shutdownKernel: () => Promise<void>;
  executeCode: (code: string, callbacks: ExecutionCallbacks, options?: ExecuteCodeOptions) => string | null;
  error: string | null;
}

export function useKernel(kernelName = "python3"): UseKernelReturn {
  const [state, dispatch] = useReducer(reducer, initialState);
  const restClientRef = useRef(new JupyterRestClient());
  const wsRef = useRef<KernelWebSocket | null>(null);
  const kernelRef = useRef<JupyterKernel | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    kernelRef.current = state.kernel;
  }, [state.kernel]);

  const bindSocketEvents = useCallback((socket: KernelWebSocket) => {
    socket.onStatusChange = (status) => {
      dispatch({ type: "SET_CONNECTION_STATUS", payload: status });
    };
    socket.onKernelStatusChange = (executionState) => {
      dispatch({ type: "SET_KERNEL_STATUS", payload: executionState });
    };
  }, []);

  const connectToKernel = useCallback(
    async (kernel: JupyterKernel): Promise<void> => {
      wsRef.current?.disconnect();
      const socket = new KernelWebSocket(kernel.id, sessionIdRef.current);
      bindSocketEvents(socket);
      wsRef.current = socket;
      await socket.connect();
    },
    [bindSocketEvents]
  );

  const startKernel = useCallback(async (): Promise<void> => {
    dispatch({ type: "SET_ERROR", payload: null });
    dispatch({ type: "SET_KERNEL_STATUS", payload: "starting" });

    try {
      const kernel = await restClientRef.current.startKernel(kernelName);
      dispatch({ type: "SET_KERNEL", payload: kernel });
      await connectToKernel(kernel);
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Không thể khởi động kernel. Kiểm tra Jupyter Server." });
      dispatch({ type: "SET_CONNECTION_STATUS", payload: "error" });
    }
  }, [connectToKernel, kernelName]);

  const restartKernel = useCallback(async (): Promise<void> => {
    const currentKernel = kernelRef.current;
    if (!currentKernel) {
      return;
    }

    dispatch({ type: "SET_ERROR", payload: null });

    try {
      wsRef.current?.disconnect();
      dispatch({ type: "SET_KERNEL_STATUS", payload: "starting" });
      const restartedKernel = await restClientRef.current.restartKernel(currentKernel.id);
      dispatch({ type: "SET_KERNEL", payload: restartedKernel });
      await connectToKernel(restartedKernel);
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Không thể restart kernel." });
      dispatch({ type: "SET_CONNECTION_STATUS", payload: "error" });
    }
  }, [connectToKernel]);

  const interruptKernel = useCallback(async (): Promise<void> => {
    const currentKernel = kernelRef.current;
    if (!currentKernel) {
      return;
    }

    dispatch({ type: "SET_ERROR", payload: null });

    try {
      await restClientRef.current.interruptKernel(currentKernel.id);
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Không thể interrupt kernel." });
    }
  }, []);

  const shutdownKernel = useCallback(async (): Promise<void> => {
    const currentKernel = kernelRef.current;
    if (!currentKernel) {
      return;
    }

    dispatch({ type: "SET_ERROR", payload: null });

    try {
      wsRef.current?.disconnect();
      await restClientRef.current.shutdownKernel(currentKernel.id);
      dispatch({ type: "SET_KERNEL", payload: null });
      dispatch({ type: "SET_KERNEL_STATUS", payload: "dead" });
      dispatch({ type: "SET_CONNECTION_STATUS", payload: "disconnected" });
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Không thể shutdown kernel." });
    }
  }, []);

  const executeCode = useCallback(
    (code: string, callbacks: ExecutionCallbacks, options?: ExecuteCodeOptions): string | null => {
      const socket = wsRef.current;
      const isReady = state.connectionStatus === "connected" && state.kernelStatus === "idle";

      if (!socket || !isReady) {
        return null;
      }

      try {
        return socket.executeCode(code, callbacks, options);
      } catch {
        dispatch({ type: "SET_ERROR", payload: "Không thể gửi execute_request tới kernel." });
        return null;
      }
    },
    [state.connectionStatus, state.kernelStatus]
  );

  useEffect(() => {
    let cancelled = false;

    const boot = async (): Promise<void> => {
      dispatch({ type: "SET_ERROR", payload: null });
      dispatch({ type: "SET_KERNEL_STATUS", payload: "starting" });

      try {
        const kernels = await restClientRef.current.listKernels();
        if (cancelled) {
          return;
        }

        const reusedKernel = kernels.find((kernel) => kernel.name === kernelName) ?? null;
        const activeKernel = reusedKernel ?? (await restClientRef.current.startKernel(kernelName));

        if (cancelled) {
          return;
        }

        dispatch({ type: "SET_KERNEL", payload: activeKernel });
        dispatch({ type: "SET_KERNEL_STATUS", payload: activeKernel.execution_state });

        await connectToKernel(activeKernel);
      } catch {
        if (!cancelled) {
          dispatch({ type: "SET_ERROR", payload: "Không thể kết nối tới Jupyter kernel." });
          dispatch({ type: "SET_CONNECTION_STATUS", payload: "error" });
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [connectToKernel, kernelName]);

  const isReady = useMemo(
    () => state.connectionStatus === "connected" && state.kernelStatus === "idle",
    [state.connectionStatus, state.kernelStatus]
  );

  return {
    kernel: state.kernel,
    kernelStatus: state.kernelStatus,
    connectionStatus: state.connectionStatus,
    isReady,
    startKernel,
    restartKernel,
    interruptKernel,
    shutdownKernel,
    executeCode,
    error: state.error
  };
}
