import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DocumentSwitcher } from "@/components/playground/DocumentSwitcher";
import type { DocumentSwitcherProps } from "@/components/playground/DocumentSwitcher/DocumentSwitcher";
import { benchmarkService } from "@/services/benchmark/benchmark-service";
import { useBenchmarkStore } from "@/stores/benchmarkStore";
import type { BenchmarkState } from "@/stores/benchmarkStore";
import { getCurrentDocument, usePersistentStore } from "@/stores/persistentStore";
import EditorRoute from "./root";

const benchmarkMocks = vi.hoisted(() => ({
  bundleBenchmarkCode: vi.fn(),
  constructWorker: vi.fn(),
  postMessage: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock("@/services/code-processor/bundle-benchmark-code", () => ({
  bundleBenchmarkCode: benchmarkMocks.bundleBenchmarkCode,
}));

vi.mock("@/services/benchmark/worker?worker", () => ({
  default: class BenchmarkWorkerMock {
    constructor() {
      benchmarkMocks.constructWorker();
    }

    addEventListener = vi.fn();
    postMessage = benchmarkMocks.postMessage;
    terminate = benchmarkMocks.terminate;
  },
}));

vi.mock("@/routes/playground/views/code/index", () => ({ CodeView: () => null }));
vi.mock("@/routes/playground/views/compare", () => ({ CompareView: () => null }));
vi.mock("@/routes/playground/views/settings", () => ({ SettingsView: () => null }));
vi.mock("@/components/playground/DocumentSwitcher", () => ({
  DocumentSwitcher: vi.fn<React.FC<DocumentSwitcherProps>>(() => null),
}));

const getDocumentActions = () => {
  renderToStaticMarkup(
    <MemoryRouter>
      <EditorRoute />
    </MemoryRouter>,
  );

  const props = vi.mocked(DocumentSwitcher).mock.calls.at(-1)?.[0];
  if (!props) {
    throw new Error("Document switcher was not rendered");
  }

  return props;
};

const startBenchmark = async () => {
  const workerStarted = new Promise<void>((resolve) => {
    benchmarkMocks.postMessage.mockImplementationOnce(() => resolve());
  });
  const currentDocument = getCurrentDocument(usePersistentStore.getState());
  const resultPromise = benchmarkService.runBenchmark(
    currentDocument.setupCode,
    currentDocument.implementations,
  );
  await workerStarted;

  return { resultPromise };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  benchmarkMocks.bundleBenchmarkCode.mockResolvedValue("processed code");
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  useBenchmarkStore.setState({
    runs: {},
    runInfoByRunId: {},
    chartData: {},
    consoleLogs: {},
  });
  usePersistentStore.setState(usePersistentStore.getInitialState());
});

afterEach(() => {
  benchmarkService.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("document deletion", () => {
  it("cancels and discards every implementation run before removing the document", async () => {
    const survivor = getCurrentDocument(usePersistentStore.getState());
    usePersistentStore.getState().createDocument();
    usePersistentStore.getState().addImplementation({
      id: "second",
      filename: "second.ts",
      content: "export const run = () => 2;",
    });
    const deletedDocument = getCurrentDocument(usePersistentStore.getState());
    const { resultPromise } = await startBenchmark();
    const runsAtRemoval: BenchmarkState["runs"][] = [];
    const unsubscribe = usePersistentStore.subscribe(() => {
      runsAtRemoval.push(useBenchmarkStore.getState().runs);
    });

    try {
      getDocumentActions().onDelete(deletedDocument.id);

      expect(runsAtRemoval).toEqual([{}]);
      expect(usePersistentStore.getState().documents).toEqual([survivor]);
      expect(usePersistentStore.getState().currentDocumentId).toBe(survivor.id);
      await expect(resultPromise).resolves.toEqual([]);
      expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      unsubscribe();
    }
  });

  it("does not start a worker or restore runs after deleting during preprocessing", async () => {
    const bundleResolvers: ((code: string) => void)[] = [];
    benchmarkMocks.bundleBenchmarkCode.mockImplementation(
      () => new Promise<string>((resolve) => bundleResolvers.push(resolve)),
    );

    const deletedDocument = getCurrentDocument(usePersistentStore.getState());
    const resultPromise = benchmarkService.runBenchmark(
      deletedDocument.setupCode,
      deletedDocument.implementations,
    );

    getDocumentActions().onDelete(deletedDocument.id);

    expect(useBenchmarkStore.getState().runs).toEqual({});
    await expect(resultPromise).resolves.toEqual([]);

    const resolveBundle = bundleResolvers.shift();
    assert.ok(resolveBundle, "Pending bundle was not created");

    resolveBundle("processed code");
    await vi.runAllTimersAsync();

    expect(benchmarkMocks.constructWorker).not.toHaveBeenCalled();
    expect(useBenchmarkStore.getState().runs).toEqual({});

    const fallback = getCurrentDocument(usePersistentStore.getState());
    expect(fallback.id).not.toBe(deletedDocument.id);
    expect(fallback.implementations[0].id).not.toBe(deletedDocument.implementations[0].id);
  });

  it("preserves another document's active session when switching and deleting", async () => {
    const activeDocument = getCurrentDocument(usePersistentStore.getState());
    const { resultPromise } = await startBenchmark();
    const activeRuns = useBenchmarkStore.getState().runs;
    usePersistentStore.getState().createDocument();
    const deletedDocument = getCurrentDocument(usePersistentStore.getState());
    const actions = getDocumentActions();

    actions.onSelect(activeDocument.id);
    actions.onSelect(deletedDocument.id);
    actions.onDelete(deletedDocument.id);

    expect(useBenchmarkStore.getState().runs).toBe(activeRuns);
    expect(benchmarkMocks.terminate).not.toHaveBeenCalled();
    expect(usePersistentStore.getState().documents).toEqual([activeDocument]);

    benchmarkService.dispose();
    await expect(resultPromise).resolves.toEqual([]);
  });
});
