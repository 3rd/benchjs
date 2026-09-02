import { useCallback, useEffect, useRef } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import Editor, { loader, Monaco as MonacoEditor, useMonaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { cn } from "@/lib/utils";
import { MonacoTab } from "@/components/common/MonacoTab";

import vsDark from "./themes/vs-dark.json";
import vsLight from "./themes/vs-light.json";

export const themes = {
  light: vsLight,
  dark: vsDark,
};

const transformToGlobalDeclarations = (dts: string) => {
  return `declare global {
${dts
  .replace(/export declare/g, "declare")
  .replace(/export interface/g, "interface")
  .replace(/export type/g, "type")
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
}

export {};`;
};

export interface MonacoProps {
  height?: string;
  defaultValue?: string;
  value?: string;
  language?: string;
  modelPathPrefix?: string;
  options?: editor.IStandaloneEditorConstructionOptions;
  className?: string;
  tabs?: MonacoTab[];
  extraLibs?: { content: string; filename: string }[];
  theme?: keyof typeof themes;
  onChange?: (value: string | undefined) => void;
  onDTSChange?: (value: string) => void;
  onChangeTab?: (tab: MonacoTab) => void;
  onCloseTab?: (tab: MonacoTab) => void;
  onCloseOtherTabs?: (tab: MonacoTab) => void;
  onCloseTabsToLeft?: (tab: MonacoTab) => void;
  onCloseTabsToRight?: (tab: MonacoTab) => void;
  onSetTabs?: (tabs: MonacoTab[]) => void;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: MonacoEditor) => void;
}

export const Monaco = ({
  className,
  tabs,
  extraLibs,
  modelPathPrefix,
  theme = "light",
  onChangeTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSetTabs,
  onDTSChange,
  onMount,
  ...props
}: MonacoProps) => {
  const monacoHelper = useMonaco();
  const activeFile = tabs?.find((f) => f.active);
  const activeFileName = activeFile?.name ?? "main.ts";
  const activeFilePath = modelPathPrefix ? `${modelPathPrefix}/${activeFileName}` : activeFileName;

  const onDTSChangeRef = useRef<((value: string) => void) | null>(null);
  onDTSChangeRef.current = onDTSChange ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!tabs) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabs.findIndex((item) => item.name === active.id);
    const newIndex = tabs.findIndex((item) => item.name === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...tabs];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      onSetTabs?.(newOrder);
    }
  };

  const handleBeforeMount = (monaco: MonacoEditor) => {
    loader.config({
      paths: {
        vs: `${location.origin}/monaco-editor/min/vs`,
      },
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      declaration: true,
      emitDeclarationOnly: true,
      esModuleInterop: true,
      noEmit: false,
      noEmitOnError: false,
      noEmitHelpers: false,
      skipLibCheck: true,
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [],
    });

    // init libs
    monaco.languages.typescript.typescriptDefaults.setExtraLibs([]);
    for (const lib of extraLibs ?? []) {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(lib.content, lib.filename);
    }
  };

  const handleMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: MonacoEditor) => {
    editor.onDidChangeModelContent(async () => {
      const value = editor.getValue();
      props.onChange?.(value);

      if (onDTSChangeRef.current) {
        const model = editor.getModel();
        if (!model) return;
        const tsWorker = await monaco.languages.typescript.getTypeScriptWorker();
        const worker = await tsWorker(model.uri);
        const outputs = await worker.getEmitOutput(model.uri.toString(), true, true);
        const dts = outputs.outputFiles.find((file) => file.name.endsWith(".d.ts"))?.text;
        if (!dts) return;

        const transformedDTS = dts ? transformToGlobalDeclarations(dts) : "";
        onDTSChangeRef.current?.(transformedDTS);
      }
    });

    editor.updateOptions({
      automaticLayout: true,
      fixedOverflowWidgets: true,
      glyphMargin: false,
      folding: false,
      padding: {
        top: 8,
        bottom: 8,
      },
      lineNumbers: "on",
      minimap: {
        enabled: false,
      },
      insertSpaces: true,
      tabSize: 2,
      scrollBeyondLastLine: false,
      renderLineHighlightOnlyWhenFocus: true,
      overviewRulerBorder: false,
      ...props.options,
    });

    onMount?.(editor, monaco);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync theme
  useEffect(() => {
    if (!monacoHelper) return;
    const themeConfig = themes[(theme as keyof typeof themes) ?? "vsLight"] as Parameters<
      typeof monacoHelper.editor.defineTheme
    >[1];
    monacoHelper.editor.defineTheme("theme", themeConfig);
    monacoHelper.editor.setTheme("theme");
  }, [monacoHelper, theme]);

  return (
    <div className="flex flex-col h-full">
      {/* tabs */}
      {tabs && tabs.length > 0 && (
        <DndContext modifiers={[restrictToHorizontalAxis]} sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex border-b border-border bg-muted">
            <SortableContext items={tabs.map((f) => f.name)} strategy={horizontalListSortingStrategy}>
              <div className="flex overflow-x-auto overflow-y-hidden custom-scrollbar">
                {tabs.map((file) => (
                  <MonacoTab
                    key={file.id}
                    tab={file}
                    tabs={tabs}
                    onClick={onChangeTab}
                    onClose={onCloseTab}
                    onCloseLeft={onCloseTabsToLeft}
                    onCloseOthers={onCloseOtherTabs}
                    onCloseRight={onCloseTabsToRight}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
        </DndContext>
      )}

      {/* editor */}
      <div className="h-full">
        <Editor
          {...props}
          key={activeFileName}
          beforeMount={handleBeforeMount}
          className={cn("nodrag h-full", className)}
          path={activeFilePath}
          theme="custom"
          onMount={handleMount}
        />
      </div>
    </div>
  );
};
