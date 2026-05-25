"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { UseKernelReturn } from "../../hooks/useKernel";

interface VariableInfo {
  name: string;
  type: string;
  shape: string;
  preview: string;
}

const INSPECT_CODE = `
import json
_vars = {}
for _k, _v in list(globals().items()):
    if not _k.startswith('_') and not callable(_v):
        try:
            _type = type(_v).__name__
            if hasattr(_v, 'shape'):
                _shape = str(_v.shape)
            elif hasattr(_v, '__len__'):
                _shape = f'len={len(_v)}'
            else:
                _shape = ''
            _preview = repr(_v)[:80]
            _vars[_k] = {'type': _type, 'shape': _shape, 'preview': _preview}
        except:
            pass
print(json.dumps(_vars))
`;

export function VariablesPanel({ kernel, refreshToken }: { kernel: UseKernelReturn; refreshToken: number }): JSX.Element {
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (!kernel.isReady) {
      setVariables([]);
      return;
    }

    setIsRefreshing(true);

    await new Promise<void>((resolve) => {
      let stdout = "";
      const messageId = kernel.executeCode(
        INSPECT_CODE,
        {
          onStream: (content) => {
            if (content.name === "stdout") {
              stdout += content.text;
            }
          },
          onReply: () => {
            try {
              const parsed = JSON.parse(stdout.trim()) as Record<string, { type: string; shape: string; preview: string }>;
              const next = Object.entries(parsed).map(([name, data]) => ({ name, ...data }));
              next.sort((a, b) => a.name.localeCompare(b.name));
              setVariables(next);
            } catch {
              setVariables([]);
            } finally {
              setIsRefreshing(false);
              resolve();
            }
          },
          onError: () => {
            setVariables([]);
            setIsRefreshing(false);
            resolve();
          }
        },
        { silent: true, storeHistory: false }
      );

      if (!messageId) {
        setIsRefreshing(false);
        resolve();
      }
    });
  }, [kernel]);

  useEffect(() => {
    void refresh();
  }, [refreshToken, refresh]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#E2E5EE] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9299A8]">Variables ({variables.length})</span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[#5A6070] hover:bg-[#EEF2FF] hover:text-[#0F1117]"
        >
          <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="overflow-auto px-2 py-2">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_2fr] gap-2 px-2 py-1 text-[11px] font-semibold uppercase text-[#9299A8]">
          <span>Name</span>
          <span>Type</span>
          <span>Shape</span>
          <span>Value</span>
        </div>

        {variables.map((item) => (
          <div
            key={item.name}
            className="grid grid-cols-[1.2fr_1fr_1fr_2fr] gap-2 rounded px-2 py-1 text-xs text-[#0F1117] hover:bg-[#EEF2FF]"
            title={item.preview}
          >
            <span className="truncate font-mono">{item.name}</span>
            <span className="truncate">{item.type}</span>
            <span className="truncate text-[#5A6070]">{item.shape || "-"}</span>
            <span className="truncate font-mono text-[#5A6070]">{item.preview}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
