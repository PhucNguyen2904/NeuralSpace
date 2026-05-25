import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExecutionCallbacks } from "../lib/jupyter/kernel-websocket";
import type {
  CellOutput,
  DisplayDataContent,
  ErrorContent,
  ExecuteResultContent,
  StreamContent
} from "../lib/jupyter/types";
import type { UseKernelReturn } from "./useKernel";
import type { UseNotebookReturn } from "./useNotebook";

export interface UseCellReturn {
  isExecuting: boolean;
  executionCount: number | null;
  executeCell: (code: string) => void;
  interruptExecution: () => void;
}

export function useCell(
  cellId: string,
  useKernelReturn: UseKernelReturn,
  useNotebookReturn: UseNotebookReturn
): UseCellReturn {
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionCount, setExecutionCount] = useState<number | null>(null);

  const outputsRef = useRef<CellOutput[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dirtyRef = useRef<boolean>(false);

  const flushOutputs = useCallback(() => {
    if (!dirtyRef.current) {
      return;
    }

    dirtyRef.current = false;
    useNotebookReturn.updateCellOutputs(cellId, [...outputsRef.current]);
  }, [cellId, useNotebookReturn]);

  const stopFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const startFlushTimer = useCallback(() => {
    stopFlushTimer();
    flushTimerRef.current = setInterval(() => {
      flushOutputs();
    }, 50);
  }, [flushOutputs, stopFlushTimer]);

  const appendStream = useCallback((content: StreamContent) => {
    const last = outputsRef.current[outputsRef.current.length - 1];

    if (last && last.output_type === "stream" && last.name === content.name) {
      last.text += content.text;
    } else {
      outputsRef.current.push({
        output_type: "stream",
        name: content.name,
        text: content.text
      });
    }

    dirtyRef.current = true;
  }, []);

  const appendResult = useCallback((content: ExecuteResultContent) => {
    outputsRef.current.push({
      output_type: "execute_result",
      execution_count: content.execution_count,
      data: content.data,
      metadata: content.metadata
    });
    dirtyRef.current = true;
  }, []);

  const appendDisplayData = useCallback((content: DisplayDataContent) => {
    outputsRef.current.push({
      output_type: "display_data",
      data: content.data,
      metadata: content.metadata
    });
    dirtyRef.current = true;
  }, []);

  const appendError = useCallback((content: ErrorContent) => {
    outputsRef.current.push({
      output_type: "error",
      ename: content.ename,
      evalue: content.evalue,
      traceback: content.traceback
    });
    dirtyRef.current = true;
  }, []);

  const executeCell = useCallback(
    (code: string) => {
      if (!useKernelReturn.isReady) {
        return;
      }

      setIsExecuting(true);
      setExecutionCount(null);

      useNotebookReturn.clearCellOutputs(cellId);
      outputsRef.current = [];
      dirtyRef.current = false;
      startFlushTimer();

      const callbacks: ExecutionCallbacks = {
        onStream: (content) => {
          appendStream(content);
        },
        onResult: (content) => {
          appendResult(content);
        },
        onDisplayData: (content) => {
          appendDisplayData(content);
        },
        onError: (content) => {
          appendError(content);
        },
        onReply: (reply) => {
          stopFlushTimer();
          flushOutputs();
          setExecutionCount(reply.execution_count);
          setIsExecuting(false);
        }
      };

      const messageId = useKernelReturn.executeCode(code, callbacks);
      if (!messageId) {
        stopFlushTimer();
        setIsExecuting(false);
      }
    },
    [
      appendDisplayData,
      appendError,
      appendResult,
      appendStream,
      cellId,
      flushOutputs,
      startFlushTimer,
      stopFlushTimer,
      useKernelReturn,
      useNotebookReturn
    ]
  );

  const interruptExecution = useCallback(() => {
    void useKernelReturn.interruptKernel();
    stopFlushTimer();
    flushOutputs();
    setIsExecuting(false);
  }, [flushOutputs, stopFlushTimer, useKernelReturn]);

  useEffect(() => {
    return () => {
      stopFlushTimer();
    };
  }, [stopFlushTimer]);

  const returnValue = useMemo<UseCellReturn>(
    () => ({
      isExecuting,
      executionCount,
      executeCell,
      interruptExecution
    }),
    [executeCell, executionCount, interruptExecution, isExecuting]
  );

  return returnValue;
}
