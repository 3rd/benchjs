import { useCallback, useEffect, useRef, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import Editor, { loader, Monaco as MonacoEditor } from "@monaco-editor/react";
import type { editor, IDisposable, languages, Uri } from "monaco-editor";
import type { CompletionEntry, CompletionInfo } from "typescript";
import { cn } from "@/lib/utils";
import { MonacoTab } from "@/components/common/MonacoTab";

import vsDark from "./themes/vs-dark.json";
import vsLight from "./themes/vs-light.json";

export const themes = {
  light: vsLight,
  dark: vsDark,
};

const EDITOR_THEME_NAME = "theme";
const SCRIPT_LANGUAGES: readonly ("javascript" | "typescript")[] = ["javascript", "typescript"];
const TYPESCRIPT_COMPLETION_TRIGGER_CHARACTERS = ["."];

type TypeScriptCompletionItem = languages.CompletionItem & {
  completionName: string;
  completionOffset: number;
  completionResource: Uri;
};

const isTypeScriptCompletionItem = (
  monaco: MonacoEditor,
  item: languages.CompletionItem,
): item is TypeScriptCompletionItem =>
  "completionName" in item &&
  typeof item.completionName === "string" &&
  "completionOffset" in item &&
  typeof item.completionOffset === "number" &&
  "completionResource" in item &&
  monaco.Uri.isUri(item.completionResource);

const getCompletionKind = (monaco: MonacoEditor, kind: string) => {
  switch (kind) {
    case "primitive type":
    case "keyword": {
      return monaco.languages.CompletionItemKind.Keyword;
    }
    case "var":
    case "local var":
    case "const":
    case "let":
    case "alias":
    case "parameter": {
      return monaco.languages.CompletionItemKind.Variable;
    }
    case "property":
    case "getter":
    case "setter": {
      return monaco.languages.CompletionItemKind.Field;
    }
    case "function":
    case "local function": {
      return monaco.languages.CompletionItemKind.Function;
    }
    case "method":
    case "construct":
    case "call":
    case "index": {
      return monaco.languages.CompletionItemKind.Method;
    }
    case "enum": {
      return monaco.languages.CompletionItemKind.Enum;
    }
    case "enum member": {
      return monaco.languages.CompletionItemKind.EnumMember;
    }
    case "module":
    case "external module name": {
      return monaco.languages.CompletionItemKind.Module;
    }
    case "class":
    case "type": {
      return monaco.languages.CompletionItemKind.Class;
    }
    case "interface": {
      return monaco.languages.CompletionItemKind.Interface;
    }
    case "warning": {
      return monaco.languages.CompletionItemKind.Text;
    }
    case "script": {
      return monaco.languages.CompletionItemKind.File;
    }
    case "directory": {
      return monaco.languages.CompletionItemKind.Folder;
    }
    case "string": {
      return monaco.languages.CompletionItemKind.Constant;
    }
    default: {
      return monaco.languages.CompletionItemKind.Property;
    }
  }
};

const displayPartsToString = (parts: readonly { text: string }[] | undefined) =>
  parts?.map((part) => part.text).join("") ?? "";

const getModelPath = (fileId: string, modelPathPrefix?: string) => {
  if (modelPathPrefix === undefined) return encodeURIComponent(fileId);
  return `${encodeURIComponent(modelPathPrefix)}/${encodeURIComponent(fileId)}`;
};

const disposeModelsForPathPrefix = (
  monaco: MonacoEditor,
  pathPrefix: string,
  retainedPaths: ReadonlySet<string>,
) => {
  for (const model of monaco.editor.getModels()) {
    if (model.uri.scheme !== "file") continue;
    if (!model.uri.path.startsWith(pathPrefix)) continue;
    if (retainedPaths.has(model.uri.path)) continue;
    model.dispose();
  }
};

const createTypeScriptCompletionProvider = (
  monaco: MonacoEditor,
  language: "javascript" | "typescript",
): languages.CompletionItemProvider => {
  const getWorker =
    language === "typescript" ?
      monaco.languages.typescript.getTypeScriptWorker
    : monaco.languages.typescript.getJavaScriptWorker;

  return {
    triggerCharacters: TYPESCRIPT_COMPLETION_TRIGGER_CHARACTERS,
    async provideCompletionItems(model, position, _context, token) {
      const workerFactory = await getWorker();
      const worker = await workerFactory(model.uri);
      if (token.isCancellationRequested || model.isDisposed()) return;

      const offset = model.getOffsetAt(position);
      const completions: CompletionInfo | undefined = await worker.getCompletionsAtPosition(
        model.uri.toString(),
        offset,
      );
      if (!completions || token.isCancellationRequested || model.isDisposed()) return;

      const word = model.getWordUntilPosition(position);
      const wordRange = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );

      return {
        incomplete: completions.isIncomplete,
        suggestions: completions.entries.map((entry: CompletionEntry) => {
          let range: languages.CompletionItem["range"] = wordRange;
          if (entry.replacementSpan) {
            const start = model.getPositionAt(entry.replacementSpan.start);
            const end = model.getPositionAt(entry.replacementSpan.start + entry.replacementSpan.length);
            range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
          } else if (completions.optionalReplacementSpan) {
            const start = model.getPositionAt(completions.optionalReplacementSpan.start);
            const end = model.getPositionAt(
              completions.optionalReplacementSpan.start + completions.optionalReplacementSpan.length,
            );
            range = {
              insert: new monaco.Range(
                wordRange.startLineNumber,
                wordRange.startColumn,
                position.lineNumber,
                position.column,
              ),
              replace: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            };
          }

          const item: TypeScriptCompletionItem = {
            label: entry.labelDetails ? { label: entry.name, ...entry.labelDetails } : entry.name,
            insertText: entry.insertText ?? entry.name,
            insertTextRules:
              entry.isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            filterText: entry.filterText,
            sortText: entry.sortText,
            kind: getCompletionKind(monaco, entry.kind),
            preselect: entry.isRecommended,
            commitCharacters: entry.commitCharacters ?? completions.defaultCommitCharacters,
            tags:
              entry.kindModifiers?.includes("deprecated") ?
                [monaco.languages.CompletionItemTag.Deprecated]
              : undefined,
            range,
            completionName: entry.name,
            completionOffset: offset,
            completionResource: model.uri,
          };
          return item;
        }),
      };
    },
    async resolveCompletionItem(item, token) {
      if (!isTypeScriptCompletionItem(monaco, item)) return item;
      const workerFactory = await getWorker();
      const worker = await workerFactory(item.completionResource);
      if (token.isCancellationRequested) return item;

      const details = await worker.getCompletionEntryDetails(
        item.completionResource.toString(),
        item.completionOffset,
        item.completionName,
      );
      if (!details || token.isCancellationRequested) return item;

      let documentation = displayPartsToString(details.documentation);
      for (const tag of details.tags ?? []) {
        const tagText = typeof tag.text === "string" ? tag.text : displayPartsToString(tag.text);
        const tagSuffix = tagText ? `: ${tagText}` : "";
        documentation += `\n\n*@${tag.name}*${tagSuffix}`;
      }

      return {
        ...item,
        kind: getCompletionKind(monaco, details.kind),
        detail: displayPartsToString(details.displayParts),
        documentation: documentation ? { value: documentation } : undefined,
      };
    },
  };
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
  onChange,
  onMount,
  ...props
}: MonacoProps) => {
  const [isLoaderConfigured, setIsLoaderConfigured] = useState(false);

  useEffect(() => {
    loader.config({
      paths: {
        vs: `${location.origin}/monaco-editor/min/vs`,
      },
    });
    setIsLoaderConfigured(true);
  }, []);

  const [monacoHelper, setMonacoHelper] = useState<MonacoEditor | null>(null);
  const activeFile = tabs?.find((f) => f.active);
  const activeFileId = activeFile?.id ?? "main.ts";
  const activeFilePath = getModelPath(activeFileId, modelPathPrefix);
  const ownedModelPathPrefix =
    modelPathPrefix === undefined ?
      null
    : `/${encodeURIComponent(modelPathPrefix)}/`;

  useEffect(() => {
    if (!monacoHelper) return;

    const resource = monacoHelper.Uri.parse(`file:///${activeFilePath}`);
    const registrations = SCRIPT_LANGUAGES.map((language) =>
      monacoHelper.languages.registerCompletionItemProvider(
        {
          language,
          scheme: resource.scheme,
          pattern: resource.path,
          exclusive: true,
        },
        createTypeScriptCompletionProvider(monacoHelper, language),
      ),
    );

    return () => {
      for (const registration of registrations) registration.dispose();
    };
  }, [activeFilePath, monacoHelper]);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelChangeRegistrationRef = useRef<IDisposable | null>(null);
  const previousModelPathPrefixRef = useRef<string | null>(null);
  const retainedModelPathsRef = useRef<ReadonlySet<string>>(new Set());
  retainedModelPathsRef.current = new Set(
    (tabs ?? []).map((tab) => `/${getModelPath(tab.id, modelPathPrefix)}`),
  );
  const mountRef = useRef<{
    options: editor.IStandaloneEditorConstructionOptions | undefined;
    onMount: MonacoProps["onMount"];
  }>({ options: undefined, onMount: undefined });
  mountRef.current = { options: props.options, onMount };

  useEffect(() => {
    const previousModelPathPrefix = previousModelPathPrefixRef.current;
    if (
      monacoHelper &&
      previousModelPathPrefix &&
      previousModelPathPrefix !== ownedModelPathPrefix
    ) {
      disposeModelsForPathPrefix(monacoHelper, previousModelPathPrefix, new Set());
    }
    previousModelPathPrefixRef.current = ownedModelPathPrefix;
  }, [monacoHelper, ownedModelPathPrefix]);

  useEffect(() => {
    if (!monacoHelper || !ownedModelPathPrefix || !tabs) return;

    const retainedPaths = new Set(retainedModelPathsRef.current);
    const currentModel = editorRef.current?.getModel();
    if (currentModel) retainedPaths.add(currentModel.uri.path);
    disposeModelsForPathPrefix(monacoHelper, ownedModelPathPrefix, retainedPaths);
  }, [modelPathPrefix, monacoHelper, ownedModelPathPrefix, tabs]);

  useEffect(() => {
    if (!monacoHelper) return;

    return () => {
      modelChangeRegistrationRef.current?.dispose();
      modelChangeRegistrationRef.current = null;
      editorRef.current = null;
      const ownedPathPrefix = previousModelPathPrefixRef.current;
      if (!ownedPathPrefix) return;
      disposeModelsForPathPrefix(monacoHelper, ownedPathPrefix, new Set());
    };
  }, [monacoHelper]);

  useEffect(() => {
    if (!monacoHelper) return;

    const registrations = (extraLibs ?? []).map((lib) => {
      const resource = monacoHelper.Uri.parse(lib.filename);
      const model = monacoHelper.editor.getModel(resource);
      if (model && model.getValue() !== lib.content) {
        model.setValue(lib.content);
      }
      return {
        resource,
        registration:
          monacoHelper.languages.typescript.typescriptDefaults.addExtraLib(
            lib.content,
            lib.filename,
          ),
      };
    });

    return () => {
      for (const { registration, resource } of registrations) {
        const model = monacoHelper.editor.getModel(resource);
        if (model?.getValue()) model.setValue("");
        registration.dispose();
      }
    };
  }, [extraLibs, monacoHelper]);

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

    const oldIndex = tabs.findIndex((item) => item.id === active.id);
    const newIndex = tabs.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...tabs];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      onSetTabs?.(newOrder);
    }
  };

  const handleBeforeMount = (monaco: MonacoEditor) => {
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
  };

  const handleMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: MonacoEditor) => {
    setMonacoHelper(monaco);
    editorRef.current = editor;
    modelChangeRegistrationRef.current?.dispose();
    modelChangeRegistrationRef.current = editor.onDidChangeModel((event) => {
      const oldModelUri = event.oldModelUrl;
      const ownedPathPrefix = previousModelPathPrefixRef.current;
      if (!oldModelUri || !ownedPathPrefix) return;
      if (!oldModelUri.path.startsWith(ownedPathPrefix)) return;
      if (retainedModelPathsRef.current.has(oldModelUri.path)) return;
      monaco.editor.getModel(oldModelUri)?.dispose();
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
      ...mountRef.current.options,
    });

    mountRef.current.onMount?.(editor, monaco);
  }, []);

  // sync theme
  useEffect(() => {
    if (!monacoHelper) return;
    const themeConfig = themes[(theme as keyof typeof themes) ?? "vsLight"] as Parameters<
      typeof monacoHelper.editor.defineTheme
    >[1];
    monacoHelper.editor.defineTheme(EDITOR_THEME_NAME, themeConfig);
    monacoHelper.editor.setTheme(EDITOR_THEME_NAME);
  }, [monacoHelper, theme]);

  return (
    <div className="flex flex-col h-full">
      {/* tabs */}
      {tabs && tabs.length > 0 && (
        <DndContext modifiers={[restrictToHorizontalAxis]} sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex border-b border-border bg-muted">
            <SortableContext items={tabs.map((f) => f.id)} strategy={horizontalListSortingStrategy}>
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
        {isLoaderConfigured && (
          <Editor
            {...props}
            beforeMount={handleBeforeMount}
            className={cn("nodrag h-full", className)}
            path={activeFilePath}
            saveViewState={false}
            theme={EDITOR_THEME_NAME}
            onChange={onChange}
            onMount={handleMount}
          />
        )}
      </div>
    </div>
  );
};
