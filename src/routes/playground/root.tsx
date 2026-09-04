import { useEffect, useMemo, useRef, useState } from "react";
import { Share2Icon } from "lucide-react";
import { Link } from "react-router";
import { useShallow } from "zustand/shallow";
import type { Route } from ".react-router/types/src/routes/playground/+types/root";
import { useBenchmarkStore } from "@/stores/benchmarkStore";
import type { BenchmarkRun } from "@/stores/benchmarkStore";
import {
  DEFAULT_DOCUMENT_TITLE,
  flushDocumentSaves,
  flushPendingDocumentSave,
  getCurrentDocument,
  importDocumentFromUrl,
  useDocumentImportStore,
  usePersistentStore,
} from "@/stores/persistentStore";
import type {
  BenchmarkDocument,
  Implementation,
} from "@/stores/persistentStore";
import { useMonacoTabs } from "@/hooks/useMonacoTabs";
import { CodeView } from "@/routes/playground/views/code/index";
import { CompareView } from "@/routes/playground/views/compare";
import { SettingsView } from "@/routes/playground/views/settings";
import { benchmarkService } from "@/services/benchmark/benchmark-service";
import { DependencyService } from "@/services/dependencies/DependencyService";
import { Header } from "@/components/layout/Header";
import { DocumentImportDialog } from "@/components/playground/DocumentImportDialog";
import { DocumentSwitcher } from "@/components/playground/DocumentSwitcher";
import { ShareDialog } from "@/components/playground/ShareDialog";
import { Sidebar, SidebarTab } from "@/components/playground/Sidebar";
import { Button } from "@/components/ui/button";

type ShareDialogPayload = {
  implementations: Implementation[];
  runs: Record<string, BenchmarkRun[]>;
  shareUrl: string;
};

const getInvalidatedImplementationIds = (
  savedDocument: BenchmarkDocument,
  sharedDocument: BenchmarkDocument,
) => {
  const runtimeContextMatches =
    savedDocument.setupCode === sharedDocument.setupCode &&
    savedDocument.libraries.length === sharedDocument.libraries.length &&
    savedDocument.libraries.every(
      (library, index) =>
        library.name === sharedDocument.libraries[index]?.name,
    );
  const savedImplementations = new Map(
    savedDocument.implementations.map((implementation) => [
      implementation.id,
      implementation,
    ]),
  );
  const sharedImplementations = new Map(
    sharedDocument.implementations.map((implementation) => [
      implementation.id,
      implementation,
    ]),
  );
  const implementationIds = new Set([
    ...savedImplementations.keys(),
    ...sharedImplementations.keys(),
  ]);

  return new Set(
    [...implementationIds].filter((implementationId) => {
      const savedImplementation = savedImplementations.get(implementationId);
      const sharedImplementation = sharedImplementations.get(implementationId);
      return (
        !runtimeContextMatches ||
        !savedImplementation ||
        !sharedImplementation ||
        savedImplementation.filename !== sharedImplementation.filename ||
        savedImplementation.content !== sharedImplementation.content
      );
    }),
  );
};

// eslint-disable-next-line no-empty-pattern
export function meta({}: Route.MetaArgs) {
  return [
    { title: "BenchJS - JavaScript Benchmarking" },
    {
      name: "description",
      content:
        "BenchJS - JavaScript benchmarking in your browser. Run, compare, and share JavaScript benchmarks with ease.",
    },
  ];
}

export default function EditorRoute() {
  const conflictingDocument = useDocumentImportStore(
    (state) => state.conflictingDocument,
  );
  const savedConflictingDocumentTitle = usePersistentStore((state) => {
    if (!conflictingDocument) return DEFAULT_DOCUMENT_TITLE;
    return (
      state.documents.find((document) => document.id === conflictingDocument.id)
        ?.title ?? DEFAULT_DOCUMENT_TITLE
    );
  });
  const currentDocumentId = usePersistentStore(
    (state) => state.currentDocumentId,
  );
  const currentTitle = usePersistentStore(
    (state) => getCurrentDocument(state).title,
  );
  const initialActiveTabId = usePersistentStore(
    (state) => getCurrentDocument(state).activeTabId,
  );
  const libraries = usePersistentStore(
    (state) => getCurrentDocument(state).libraries,
  );
  const implementationMetadata = usePersistentStore(
    useShallow((state) =>
      getCurrentDocument(state).implementations.flatMap((implementation) => [
        implementation.id,
        implementation.filename,
      ]),
    ),
  );
  const documentMetadata = usePersistentStore(
    useShallow((state) =>
      state.documents.flatMap((document) => [document.id, document.title]),
    ),
  );
  const implementations = useMemo(() => {
    const result: Pick<Implementation, "filename" | "id">[] = [];
    for (let index = 0; index < implementationMetadata.length; index += 2) {
      const id = implementationMetadata[index];
      const filename = implementationMetadata[index + 1];
      if (id === undefined || filename === undefined) continue;
      result.push({ id, filename });
    }
    return result;
  }, [implementationMetadata]);
  const documents = useMemo(() => {
    const result: { id: string; title: string }[] = [];
    for (let index = 0; index < documentMetadata.length; index += 2) {
      const id = documentMetadata[index];
      const title = documentMetadata[index + 1];
      if (id === undefined || title === undefined) continue;
      result.push({ id, title });
    }
    return result;
  }, [documentMetadata]);
  const {
    setActiveTabId,
    createDocument,
    removeDocument,
    renameDocument,
    setCurrentDocumentId,
    resolveDocumentImport,
  } = usePersistentStore(
    useShallow((state) => ({
      setActiveTabId: state.setActiveTabId,
      createDocument: state.createDocument,
      removeDocument: state.removeDocument,
      renameDocument: state.renameDocument,
      setCurrentDocumentId: state.setCurrentDocumentId,
      resolveDocumentImport: state.resolveDocumentImport,
    })),
  );
  const monacoTabs = useMonacoTabs(implementations, {
    documentId: currentDocumentId,
    initialActiveTabId,
    onTabChange: (tabId: string | null) => {
      setActiveTabId(tabId);
    },
  });
  const [activeTab, setActiveTab] = useState<SidebarTab>("code");
  const [shareData, setShareData] = useState<ShareDialogPayload | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const handleShare = () => {
    flushDocumentSaves();
    const shareUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    const sharedDocument = getCurrentDocument(usePersistentStore.getState());
    setShareData({
      implementations: sharedDocument.implementations,
      runs: useBenchmarkStore.getState().runs,
      shareUrl,
    });
    setShareOpen(true);
  };

  const handleOverwriteDocument = () => {
    if (!conflictingDocument) return;

    const savedDocument = usePersistentStore
      .getState()
      .documents.find((document) => document.id === conflictingDocument.id);
    if (savedDocument) {
      benchmarkService.discardRunsForImplementations(
        getInvalidatedImplementationIds(savedDocument, conflictingDocument),
      );
    }
    resolveDocumentImport("overwrite");
  };

  const dependencyService = useRef(new DependencyService());
  useEffect(() => {
    dependencyService.current.syncLibraries(libraries);
  }, [libraries]);
  useEffect(() => {
    const service = dependencyService.current;
    return () => service.dispose();
  }, []);
  useEffect(() => benchmarkService.dispose, []);
  useEffect(() => {
    window.addEventListener("hashchange", importDocumentFromUrl);
    return () =>
      window.removeEventListener("hashchange", importDocumentFromUrl);
  }, []);
  useEffect(() => {
    window.addEventListener("blur", flushPendingDocumentSave);
    return () => window.removeEventListener("blur", flushPendingDocumentSave);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <Header
        className="static"
        postLogoElement={
          <DocumentSwitcher
            currentDocumentId={currentDocumentId}
            currentTitle={currentTitle}
            documents={documents}
            onCreate={createDocument}
            onDelete={removeDocument}
            onRename={renameDocument}
            onSelect={setCurrentDocumentId}
          />
        }
        customNav={
          <Button className="gap-2" variant="outline" onClick={handleShare}>
            <Share2Icon className="w-4 h-4" />
            Share
          </Button>
        }
      />

      <div className="flex overflow-hidden flex-1 w-full">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex overflow-auto flex-col flex-1 h-full">
          {activeTab === "code" && (
            <CodeView
              dependencyService={dependencyService.current}
              documentId={currentDocumentId}
              monacoTabs={monacoTabs}
            />
          )}
          {activeTab === "compare" && <CompareView />}
          {activeTab === "settings" && (
            <SettingsView dependencyService={dependencyService.current} />
          )}
        </div>
      </div>

      <ShareDialog
        implementations={shareData?.implementations ?? []}
        open={shareOpen}
        runs={shareData?.runs ?? {}}
        shareUrl={shareData?.shareUrl ?? ""}
        onOpenChange={setShareOpen}
      />

      <DocumentImportDialog
        open={Boolean(conflictingDocument)}
        savedDocumentTitle={savedConflictingDocumentTitle}
        sharedDocumentTitle={
          conflictingDocument?.title ?? DEFAULT_DOCUMENT_TITLE
        }
        onMakeCopy={() => resolveDocumentImport("copy")}
        onOverwrite={handleOverwriteDocument}
      />

      <div className="flex fixed top-0 right-0 bottom-0 left-0 z-50 justify-center items-center p-4 w-full h-full sm:hidden bg-black/50 backdrop-blur-sm dark:bg-black/80">
        <div className="flex flex-col gap-4 justify-center items-center p-4 py-8 text-center bg-card border-2 border-border rounded-lg">
          <h1 className="mb-4 text-2xl font-bold">
            Mobile is not supported 🫠
          </h1>
          <p>
            The playground includes a code editor and many tabs, and it&apos;s
            not a good experience on mobile, please use a desktop browser.
          </p>
          <Link to="/">
            <Button variant="outline">Go back</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
