"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditorType } from "monaco-editor";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="h-[88px] w-full animate-pulse rounded-md bg-[#F8FAFC]" />
});

export interface CellEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  onExecuteAndInsert: () => void;
  onSave?: () => void;
  isExecuting: boolean;
  language?: "python" | "markdown" | "raw";
  readOnly?: boolean;
}

const MIN_HEIGHT = 52;
const MAX_HEIGHT = 500;

const MONACO_OPTIONS: MonacoEditorType.IStandaloneEditorConstructionOptions = {
  fontSize: 13.5,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontLigatures: true,
  lineHeight: 22,
  lineNumbers: "on",
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 10,
  glyphMargin: false,
  padding: { top: 10, bottom: 10 },
  minimap: { enabled: false },
  folding: false,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  renderLineHighlight: "line",
  renderLineHighlightOnlyWhenFocus: true,
  scrollBeyondLastLine: false,
  scrollbar: {
    vertical: "hidden",
    horizontal: "auto",
    horizontalScrollbarSize: 4,
    alwaysConsumeMouseWheel: false
  },
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  smoothScrolling: true,
  wordWrap: "off",
  tabSize: 4,
  insertSpaces: true,
  detectIndentation: true,
  contextmenu: true
};

function defineJupyterTheme(monaco: typeof import("monaco-editor")): void {
  monaco.editor.defineTheme("kaggle-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "0070F3", fontStyle: "bold" },
      { token: "keyword.control", foreground: "0070F3", fontStyle: "bold" },
      { token: "string", foreground: "20A757" },
      { token: "string.escape", foreground: "20A757" },
      { token: "comment", foreground: "A0AEC0", fontStyle: "italic" },
      { token: "number", foreground: "D97706" },
      { token: "type.identifier", foreground: "6366F1" },
      { token: "delimiter", foreground: "64748B" }
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1A202C",
      "editorGutter.background": "#F8FAFC",
      "editorLineNumber.foreground": "#CBD5E0",
      "editorLineNumber.activeForeground": "#6366F1",
      "editor.lineHighlightBackground": "#F0F4FF",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#C7D2FE80",
      "editor.inactiveSelectionBackground": "#E0E7FF50",
      "editorCursor.foreground": "#6366F1",
      "editorIndentGuide.background": "#E2E8F0",
      "editorIndentGuide.activeBackground": "#94A3B8"
    }
  });
}

export function CellEditor({
  value,
  onChange,
  onExecute,
  onExecuteAndInsert,
  onSave,
  isExecuting,
  language = "python",
  readOnly = false
}: CellEditorProps): JSX.Element {
  const [height, setHeight] = useState<number>(MIN_HEIGHT);
  const themeInitializedRef = useRef<boolean>(false);
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);

  const computedLanguage = useMemo(() => (language === "raw" ? "plaintext" : language), [language]);

  const handleEditorMount = useCallback(
    (editor: MonacoEditorType.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
      editorRef.current = editor;
      if (!themeInitializedRef.current) {
        defineJupyterTheme(monaco);
        themeInitializedRef.current = true;
      }

      monaco.editor.setTheme("kaggle-light");

      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => onExecute());
      editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => onExecuteAndInsert());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSave?.());

      const updateHeight = (): void => {
        const contentHeight = Math.min(Math.max(editor.getContentHeight(), MIN_HEIGHT), MAX_HEIGHT);
        setHeight(contentHeight + 24);
        editor.layout();
      };

      editor.onDidContentSizeChange(updateHeight);
      editor.onDidChangeModelContent(() => {
        onChange(editor.getValue());
      });
      editor.onDidBlurEditorText(() => {
        onChange(editor.getValue());
      });
      updateHeight();
    },
    [onChange, onExecute, onExecuteAndInsert, onSave]
  );

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-[#E2E8F0] bg-white" style={{ height: `${height}px` }}>
      <MonacoEditor
        value={value}
        language={computedLanguage}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        onMount={handleEditorMount}
        theme="kaggle-light"
        options={{ ...MONACO_OPTIONS, readOnly }}
      />
      {isExecuting ? <span className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-400 status-pulse" /> : null}
    </div>
  );
}
