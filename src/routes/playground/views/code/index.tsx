import { useCallback, useMemo, useRef, useState } from "react";
import { Monaco as MonacoEditor } from "@monaco-editor/react";
import { editor as RawMonacoEditor } from "monaco-editor";
import { nanoid } from "nanoid";
import { ImperativePanelHandle } from "react-resizable-panels";
import { useShallow } from "zustand/shallow";
import { useLatestRunForImplementation } from "@/stores/benchmarkStore";
import { getCurrentDocument, usePersistentStore } from "@/stores/persistentStore";
import { useUserStore } from "@/stores/userStore";
import { useMonacoTabs } from "@/hooks/useMonacoTabs";
import { DEFAULT_IMPLEMENTATION, README_FILE_ID, SETUP_FILE_ID } from "@/constants";
import { cn } from "@/lib/utils";
import { benchmarkService } from "@/services/benchmark/benchmark-service";
import { DependencyService } from "@/services/dependencies";
import { FileTree, FileTreeItem } from "@/components/common/FileTree";
import { Monaco } from "@/components/common/Monaco";
import { RunPanel, RunPanelTabs } from "@/components/playground/code/RunPanel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

const MIN_SIDEBAR_WIDTH = 280;

interface CodeViewProps {
  monacoTabs: ReturnType<typeof useMonacoTabs>;
  dependencyService: DependencyService;
  documentId: string;
}

export const CodeView = ({ monacoTabs, dependencyService, documentId }: CodeViewProps) => {
  const currentDocument = usePersistentStore(getCurrentDocument);
  const store = usePersistentStore(
    useShallow((state) => ({
      addImplementation: state.addImplementation,
      removeImplementation: state.removeImplementation,
      renameImplementation: state.renameImplementation,
      updateImplementationCode: state.updateImplementationCode,
      setSetupCode: state.setSetupCode,
      setSetupDTS: state.setSetupDTS,
      setReadmeContent: state.setReadmeContent,
    })),
  );
  const { codeViewLayout: layout, setCodeViewLayout, theme } = useUserStore();

  const currentImplementation = useMemo(() => {
    return currentDocument.implementations.find((item) => item.id === monacoTabs.activeTabId);
  }, [currentDocument.implementations, monacoTabs.activeTabId]);
  const currentImplementationId = currentImplementation?.id;

  const latestRun = useLatestRunForImplementation(currentImplementation?.id ?? "");

  const getFileContent = (id: string) => {
    if (id === README_FILE_ID) return currentDocument.readmeContent;
    if (id === SETUP_FILE_ID) return currentDocument.setupCode;
    return currentDocument.implementations.find((item) => item.id === id)?.content || "";
  };

  const root = useMemo<FileTreeItem>(() => {
    return {
      id: "root",
      name: "root",
      type: "root",
      children: [
        {
          id: "implementations",
          name: "implementations",
          type: "folder",
          children: currentDocument.implementations.map((item) => ({
            id: item.id,
            name: item.filename,
            type: "file",
            actions: {
              onRename: (newName: string) => {
                const trimmedName = newName.trim();
                const isDuplicate = currentDocument.implementations.some(
                  (otherItem) =>
                    otherItem.id !== item.id &&
                    otherItem.filename.toLowerCase() === trimmedName.toLowerCase(),
                );

                if (isDuplicate) {
                  throw new Error("An implementation with this name already exists");
                }

                store.renameImplementation(item.id, trimmedName);
              },
              onDelete: () => {
                store.removeImplementation(item.id);
              },
              onDuplicate: () => {
                const id = nanoid();
                const existingFilenames = new Set(currentDocument.implementations.map((i) => i.filename));

                // handle file extension
                let baseName = item.filename;
                let extension = "";
                const lastDotIndex = item.filename.lastIndexOf(".");
                if (lastDotIndex !== -1) {
                  baseName = item.filename.slice(0, lastDotIndex);
                  extension = item.filename.slice(lastDotIndex);
                }

                // find next available variant
                let counter = 2;
                let newName = `${baseName}-${counter}${extension}`;
                while (existingFilenames.has(newName)) {
                  counter++;
                  newName = `${baseName}-${counter}${extension}`;
                }

                store.addImplementation({
                  id,
                  filename: newName,
                  content: item.content,
                });
                monacoTabs.openTab({ id, name: newName, active: true });
              },
            },
          })),
          actions: {
            onCreate: () => {
              const id = nanoid();
              const existingFilenames = new Set(currentDocument.implementations.map((i) => i.filename));
              let filename = `implementation-${currentDocument.implementations.length + 1}.ts`;
              let i = currentDocument.implementations.length + 1;
              while (existingFilenames.has(filename)) {
                filename = `implementation-${i++}.ts`;
              }
              store.addImplementation({
                id,
                filename,
                content: DEFAULT_IMPLEMENTATION,
              });
              monacoTabs.openTab({ id, name: filename, active: true });
            },
          },
        },
        {
          id: SETUP_FILE_ID,
          name: SETUP_FILE_ID,
          type: "file",
        },
        {
          id: README_FILE_ID,
          name: README_FILE_ID,
          type: "file",
        },
      ],
    };
  }, [currentDocument.implementations, monacoTabs, store]);

  const extraLibs = useMemo(() => {
    if (!currentImplementationId) return [];
    return [
      {
        filename: "file:///setup.d.ts",
        content: currentDocument.setupDTS,
      },
    ];
  }, [currentDocument.setupDTS, currentImplementationId]);

  const handleFileContentChange = useCallback(
    (content: string | undefined) => {
      if (!monacoTabs.activeTabId || content === undefined) return;

      if (monacoTabs.activeTabId === SETUP_FILE_ID) {
        store.setSetupCode(content);
      } else if (monacoTabs.activeTabId === README_FILE_ID) {
        store.setReadmeContent(content);
      } else {
        store.updateImplementationCode(monacoTabs.activeTabId, content);
      }
    },
    [monacoTabs.activeTabId, store],
  );

  const handleSetupDTSChange = useCallback(
    (value: string) => {
      store.setSetupDTS(value);
    },
    [store],
  );

  const handleRun = useCallback(() => {
    const document = getCurrentDocument(usePersistentStore.getState());
    const implementation = document.implementations.find((item) => item.id === monacoTabs.activeTabId);
    if (!implementation) return;
    benchmarkService.runBenchmark(document.setupCode, [implementation]);
  }, [monacoTabs.activeTabId]);

  const handleStop = useCallback(() => {
    if (!latestRun) return;
    benchmarkService.stopBenchmark(latestRun.id);
  }, [latestRun]);

  const defaultSidebarSize = (MIN_SIDEBAR_WIDTH * 100) / window.innerWidth;

  // editor
  const handleEditorMount = useCallback(
    (editor: RawMonacoEditor.IStandaloneCodeEditor, monaco: MonacoEditor) => {
      dependencyService.mountEditor(editor, monaco);
      for (const item of currentDocument.libraries) {
        dependencyService.addLibrary(item);
      }
    },
    [currentDocument.libraries, dependencyService],
  );

  const runPanelRef = useRef<ImperativePanelHandle>(null);
  const [isRunPanelCollapsed, setIsRunPanelCollapsed] = useState(false);
  const [activeRunPanelTab, setActiveRunPanelTab] = useState<"console" | "run">("run");
  const handleLayoutChange = useCallback(() => {
    setCodeViewLayout(layout === "vertical" ? "horizontal" : "vertical");
  }, [layout, setCodeViewLayout]);
  const handleCollapseRunPanel = useCallback(() => {
    runPanelRef.current?.collapse();
    setIsRunPanelCollapsed(true);
  }, []);
  const handleExpandRunPanel = useCallback(() => {
    runPanelRef.current?.expand();
    setIsRunPanelCollapsed(false);
  }, []);

  return (
    <ResizablePanelGroup className="flex flex-1 w-full" direction="horizontal">
      <ResizablePanel className={cn("flex")} defaultSize={defaultSidebarSize} id="file-tree-panel">
        {/* left - file tree */}
        <div className="flex-1 px-1 h-full text-sm bg-muted border-r-2 border-border">
          <div className="p-2 font-medium uppercase">Code</div>
          <FileTree
            activeFileId={monacoTabs.activeTabId || undefined}
            item={root}
            level={0}
            onFileClick={(item) => {
              return monacoTabs.openTab({
                id: item.id,
                name: item.name,
                active: true,
              });
            }}
          />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id="right-panel">
        {/* right */}
        <ResizablePanelGroup className="h-full" direction={layout}>
          <ResizablePanel defaultSize={70} id="editor-panel">
            <Monaco
              extraLibs={extraLibs}
              language={monacoTabs.activeTabId?.endsWith(".md") ? "markdown" : "typescript"}
              modelPathPrefix={documentId}
              tabs={monacoTabs.tabs}
              theme={theme}
              value={getFileContent(monacoTabs.activeTabId ?? "")}
              onChange={handleFileContentChange}
              onChangeTab={monacoTabs.changeTab}
              onCloseOtherTabs={monacoTabs.closeOtherTabs}
              onCloseTab={monacoTabs.closeTab}
              onCloseTabsToLeft={monacoTabs.closeTabsToLeft}
              onCloseTabsToRight={monacoTabs.closeTabsToRight}
              onDTSChange={monacoTabs.activeTabId === SETUP_FILE_ID ? handleSetupDTSChange : undefined}
              onMount={handleEditorMount}
              onSetTabs={monacoTabs.setTabs}
            />
          </ResizablePanel>
          {currentImplementation && (
            <>
              <ResizableHandle />

              {/* full run panel */}
              <ResizablePanel
                ref={runPanelRef}
                defaultSize={layout === "vertical" ? 35 : 50}
                id="run-panel"
                minSize={10}
                collapsible
              >
                <RunPanel
                  activeTab={activeRunPanelTab}
                  implementationId={currentImplementation.id}
                  layout={layout}
                  onLayoutChange={handleLayoutChange}
                  onRun={handleRun}
                  onStop={handleStop}
                  onTabChange={setActiveRunPanelTab}
                  onToggleCollapse={handleCollapseRunPanel}
                />
              </ResizablePanel>

              {/* collapsed run panel */}
              {isRunPanelCollapsed && (
                <RunPanelTabs
                  activeTab={activeRunPanelTab}
                  isRunning={latestRun?.status === "running" || latestRun?.status === "warmup"}
                  layout={layout}
                  isCollapsed
                  onLayoutChange={handleLayoutChange}
                  onTabChange={(tab) => setActiveRunPanelTab(tab as "console" | "run")}
                  onToggleCollapse={handleExpandRunPanel}
                />
              )}
            </>
          )}
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
