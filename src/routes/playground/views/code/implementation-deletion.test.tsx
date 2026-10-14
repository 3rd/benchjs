import { renderToStaticMarkup } from "react-dom/server";
import { FileTree } from "@/components/common/FileTree";
import { useMonacoTabs } from "@/hooks/useMonacoTabs";
import { benchmarkService } from "@/services/benchmark/benchmark-service";
import { DependencyService } from "@/services/dependencies";
import { useBenchmarkStore } from "@/stores/benchmarkStore";
import { getCurrentDocument, usePersistentStore } from "@/stores/persistentStore";
import { CodeView } from "./index";

const benchmarkMocks = vi.hoisted(() => ({
  bundleBenchmarkCode: vi.fn(),
  postMessage: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock("@/services/code-processor/bundle-benchmark-code", () => ({
  bundleBenchmarkCode: benchmarkMocks.bundleBenchmarkCode,
}));

vi.mock("@/services/benchmark/worker?worker", () => ({
  default: class BenchmarkWorkerMock {
    addEventListener = vi.fn();
    postMessage = benchmarkMocks.postMessage;
    terminate = benchmarkMocks.terminate;
  },
}));

vi.mock("@/components/common/Monaco", () => ({ Monaco: () => null }));
vi.mock("@/components/common/FileTree", () => ({
  FileTree: vi.fn<typeof FileTree>(() => <></>),
}));

const CodeViewHarness = () => {
  const document = getCurrentDocument(usePersistentStore.getState());
  const monacoTabs = useMonacoTabs(document.implementations, {
    documentId: document.id,
    initialActiveTabId: document.activeTabId,
    onTabChange: usePersistentStore.getState().setActiveTabId,
  });

  return (
    <CodeView
      dependencyService={new DependencyService()}
      documentId={document.id}
      monacoTabs={monacoTabs}
    />
  );
};

const getDeleteAction = (implementationId: string) => {
  vi.stubGlobal("window", { innerWidth: 1440 });
  renderToStaticMarkup(<CodeViewHarness />);
  vi.stubGlobal("window", undefined);

  const props = vi.mocked(FileTree).mock.calls.at(-1)?.[0];
  const implementation = props?.item.children
    ?.find((item) => item.id === "implementations")
    ?.children?.find((item) => item.id === implementationId);
  const onDelete = implementation?.actions?.onDelete;
  assert(onDelete, "Implementation delete action was not rendered");

  return onDelete;
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

describe("implementation deletion", () => {
  it("discards the deleted run and cancels surviving members of its worker batch", async () => {
    usePersistentStore.getState().addImplementation({
      id: "survivor",
      filename: "survivor.ts",
      content: "export const run = () => 2;",
    });
    const document = getCurrentDocument(usePersistentStore.getState());
    const deletedImplementation = document.implementations[0];
    const workerStarted = new Promise<void>((resolve) => {
      benchmarkMocks.postMessage.mockImplementationOnce(resolve);
    });
    const resultPromise = benchmarkService.runBenchmark(
      document.setupCode,
      document.implementations,
    );
    await workerStarted;

    getDeleteAction(deletedImplementation.id)();

    const state = useBenchmarkStore.getState();
    expect(state.runs[deletedImplementation.id]).toBeUndefined();
    expect(state.runs.survivor.map((run) => run.status)).toEqual(["cancelled"]);
    expect(getCurrentDocument(usePersistentStore.getState()).implementations).toEqual([
      document.implementations[1],
    ]);
    await expect(resultPromise).resolves.toEqual([]);
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restart or restore a deleted run when its preprocessing finishes", async () => {
    const bundleResolvers: ((code: string) => void)[] = [];
    benchmarkMocks.bundleBenchmarkCode.mockImplementation(
      () => new Promise<string>((resolve) => bundleResolvers.push(resolve)),
    );
    const document = getCurrentDocument(usePersistentStore.getState());
    const resultPromise = benchmarkService.runBenchmark(
      document.setupCode,
      document.implementations,
    );

    getDeleteAction(document.implementations[0].id)();

    expect(useBenchmarkStore.getState().runs).toEqual({});
    await expect(resultPromise).resolves.toEqual([]);

    const resolveBundle = bundleResolvers.shift();
    assert(resolveBundle, "Pending bundle not found");

    resolveBundle("processed code");
    await vi.runAllTimersAsync();

    expect(benchmarkMocks.postMessage).not.toHaveBeenCalled();
    expect(useBenchmarkStore.getState().runs).toEqual({});
    expect(getCurrentDocument(usePersistentStore.getState()).implementations).toEqual([]);
  });
});
