"use client";

import AnsiToHtml from "ansi-to-html";
import { Copy, Check } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { CellOutput as NotebookOutput, MimeBundle } from "../../lib/jupyter/types";

function OutputCopyButton({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Sao chép kết quả"
      className="absolute right-2 top-2 rounded p-1.5 bg-white/80 shadow-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100"
    >
      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  );
}

export interface CellOutputProps {
  outputs: NotebookOutput[];
  isExecuting: boolean;
}

const ansiConverter = new AnsiToHtml({ escapeXML: true });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeSvg(svg: string): string {
  return svg.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/on\w+="[^"]*"/gi, "");
}

function renderJsonSyntax(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  if (!json) {
    return "";
  }

  const escaped = escapeHtml(json);
  return escaped.replace(/("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g, (match) => {
    if (match.startsWith('"')) {
      if (match.endsWith(":")) {
        return `<span class=\"text-violet-600\">${match.slice(0, -1)}</span><span>:</span>`;
      }
      return `<span class=\"text-emerald-600\">${match}</span>`;
    }

    if (match === "true" || match === "false" || match === "null") {
      return `<span class=\"text-violet-600\">${match}</span>`;
    }

    return `<span class=\"text-amber-700\">${match}</span>`;
  });
}

function getMimeType(data: MimeBundle): "image" | "svg" | "html" | "markdown" | "json" | "text" {
  if (data["image/png"] || data["image/jpeg"]) {
    return "image";
  }
  if (typeof data["image/svg+xml"] === "string") {
    return "svg";
  }
  if (typeof data["text/html"] === "string") {
    return "html";
  }
  if (typeof data["text/markdown"] === "string") {
    return "markdown";
  }
  if (data["application/json"] !== undefined) {
    return "json";
  }
  return "text";
}

function DotsLoader(): JSX.Element {
  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
      <span>Đang thực thi...</span>
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:240ms]" />
      </div>
    </div>
  );
}

export function CellOutput({ outputs, isExecuting }: CellOutputProps): JSX.Element {
  const [expandedStreamIndexes, setExpandedStreamIndexes] = useState<Record<number, boolean>>({});
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const renderedOutputs = useMemo(
    () =>
      outputs.map((output, index) => {
        if (output.output_type === "stream") {
          const lines = output.text.split("\n");
          const tooLong = lines.length > 100;
          const shouldExpand = expandedStreamIndexes[index] ?? false;
          const visibleText = tooLong && !shouldExpand ? lines.slice(0, 50).join("\n") : output.text;

          return (
            <div key={`${index}-${output.name}`} className="space-y-2 relative group">
              <OutputCopyButton text={output.text} />
              <pre
                className={
                  output.name === "stderr"
                    ? "overflow-x-auto rounded-md border border-amber-200 bg-amber-50 p-3 font-mono text-xs text-amber-700"
                    : "overflow-x-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-xs text-text-primary"
                }
              >
                {visibleText}
                {tooLong && !shouldExpand ? "\n... [truncated]" : ""}
              </pre>
              {tooLong ? (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:text-brand-500"
                  onClick={() => {
                    setExpandedStreamIndexes((current) => ({ ...current, [index]: !shouldExpand }));
                  }}
                >
                  {shouldExpand ? "Thu gon" : "Xem toan bo"}
                </button>
              ) : null}
            </div>
          );
        }

        if (output.output_type === "error") {
          return (
            <div key={`${index}-error`} className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 relative group">
              <OutputCopyButton text={`${output.ename}: ${output.evalue}\n${output.traceback.join("\n")}`} />
              <p className="font-semibold text-red-700">
                {output.ename}: {output.evalue}
              </p>
              <div className="mt-2 space-y-1 font-mono text-xs text-red-700">
                {output.traceback.map((line, lineIndex) => (
                  <div
                    key={`${index}-tb-${lineIndex}`}
                    dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
                  />
                ))}
              </div>
            </div>
          );
        }

        const data = output.data;
        const mimeType = getMimeType(data);

        if (mimeType === "image") {
          const png = data["image/png"];
          const jpeg = data["image/jpeg"];
          const src = png ? `data:image/png;base64,${png}` : `data:image/jpeg;base64,${jpeg}`;

          return (
            <button key={`${index}-image`} type="button" className="block w-full" onClick={() => setLightboxImage(src)}>
              <img src={src} alt="Cell output" className="max-h-[400px] max-w-full rounded-md border border-border object-contain" />
            </button>
          );
        }

        if (mimeType === "svg") {
          return (
            <div
              key={`${index}-svg`}
              className="overflow-auto rounded-md border border-border bg-white p-2"
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(String(data["image/svg+xml"])) }}
            />
          );
        }

        if (mimeType === "html") {
          return (
            <iframe
              key={`${index}-html`}
              title={`output-html-${index}`}
              srcDoc={String(data["text/html"])}
              sandbox="allow-scripts"
              className="h-[240px] max-h-[400px] w-full rounded-md border border-border bg-white"
            />
          );
        }

        if (mimeType === "markdown") {
          return (
            <div key={`${index}-md`} className="prose prose-sm max-w-none rounded-md border border-border bg-white p-3 relative group">
              <OutputCopyButton text={String(data["text/markdown"])} />
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{String(data["text/markdown"])}</ReactMarkdown>
            </div>
          );
        }

        if (mimeType === "json") {
          return (
            <div key={`${index}-json`} className="relative group">
              <OutputCopyButton text={JSON.stringify(data["application/json"], null, 2)} />
              <pre
                className="overflow-x-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-xs"
                dangerouslySetInnerHTML={{ __html: renderJsonSyntax(data["application/json"]) }}
              />
            </div>
          );
        }

        return (
          <div key={`${index}-text`} className="relative group">
            <OutputCopyButton text={String(data["text/plain"] ?? "")} />
            <pre className="overflow-x-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-xs text-text-primary">
              {String(data["text/plain"] ?? "")}
            </pre>
          </div>
        );
      }),
    [expandedStreamIndexes, outputs]
  );

  if (outputs.length === 0 && !isExecuting) {
    return <></>;
  }

  return (
    <div className="mt-2 space-y-2">
      {renderedOutputs}
      {isExecuting ? <DotsLoader /> : null}
      {lightboxImage ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightboxImage(null)}
        >
          <img src={lightboxImage} alt="Zoomed output" className="max-h-full max-w-full rounded-md bg-white p-1" />
        </button>
      ) : null}
    </div>
  );
}
