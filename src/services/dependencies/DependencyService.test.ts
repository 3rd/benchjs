import { useDependenciesStore } from "@/stores/dependenciesStore";
import { DependencyService } from "./DependencyService";

const dependencyMocks = vi.hoisted(() => ({
  ataSources: [] as string[],
  cachedFetch: vi.fn(),
  typeErrors: new Map<string, Error>(),
  typeFiles: new Map<string, { content: string; path: string }[]>(),
}));

vi.mock("@/services/dependencies/cachedFetch", () => ({
  cachedFetch: dependencyMocks.cachedFetch,
}));

vi.mock("@/services/dependencies/ata", () => ({
  createATA:
    (options: { handlers: { receivedFile?: (content: string, path: string) => void } }) =>
    async (source: string) => {
      dependencyMocks.ataSources.push(source);
      const packageName = (/^import "([^"]+)"/.exec(source))?.[1];
      if (!packageName) throw new Error(`Unexpected ATA source: ${source}`);
      const versionSpec = (/\/\/ types: (.+)$/.exec(source))?.[1];
      const typeKey = versionSpec ? `${packageName}@${versionSpec}` : packageName;
      for (const file of dependencyMocks.typeFiles.get(typeKey) ?? []) {
        options.handlers.receivedFile?.(file.content, file.path);
      }
      const typeError = dependencyMocks.typeErrors.get(typeKey);
      if (typeError) throw typeError;
    },
}));

const createPackageResponse = () =>
  new Response(
    JSON.stringify({
      name: "package",
      version: "1.0.0",
      description: "Package description",
    }),
  );

const createDeferred = <Value>() => {
  let resolve: (value: Value) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createService = () => {
  const extraLibs = new Map<string, string>();
  const javascriptExtraLibs = new Map<string, string>();
  const service = new DependencyService();
  service.monaco = {
    languages: {
      typescript: {
        javascriptDefaults: {
          addExtraLib: (content: string, filePath?: string) => {
            if (!filePath) throw new Error("Expected an extra-lib file path");
            javascriptExtraLibs.set(filePath, content);
            return {
              dispose: () => {
                javascriptExtraLibs.delete(filePath);
              },
            };
          },
        },
        typescriptDefaults: {
          addExtraLib: (content: string, filePath?: string) => {
            if (!filePath) throw new Error("Expected an extra-lib file path");
            extraLibs.set(filePath, content);
            return {
              dispose: () => {
                extraLibs.delete(filePath);
              },
            };
          },
        },
      },
    },
  };
  return { extraLibs, javascriptExtraLibs, service };
};

beforeEach(() => {
  vi.clearAllMocks();
  dependencyMocks.ataSources.length = 0;
  dependencyMocks.typeErrors.clear();
  dependencyMocks.typeFiles.clear();
  dependencyMocks.cachedFetch.mockImplementation(createPackageResponse);
  useDependenciesStore.getState().reset();
});

describe("DependencyService library lifecycle", () => {
  it("requests and registers declarations for the selected package version", async () => {
    dependencyMocks.typeFiles.set("alpha@1", [
      {
        content: "export declare const versionOne: true;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    dependencyMocks.typeFiles.set("alpha@2", [
      {
        content: "export declare const versionTwo: true;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    const { extraLibs, javascriptExtraLibs, service } = createService();

    await service.addLibrary({ name: "alpha@1" });

    expect(dependencyMocks.ataSources).toEqual(['import "alpha" // types: 1']);
    expect(extraLibs.get("file:///node_modules/alpha/index.d.ts")).toBe(
      "export declare const versionOne: true;",
    );
    expect(javascriptExtraLibs.get("file:///node_modules/alpha/index.d.ts")).toBe(
      "export declare const versionOne: true;",
    );
  });

  it.each([
    ["a scoped selected version", "@scope/alpha@1.2.3", 'import "@scope/alpha" // types: 1.2.3'],
    ["an unversioned package", "alpha", 'import "alpha"'],
  ])("builds the ATA source for %s", async (_name, libraryName, expectedSource) => {
    const { service } = createService();

    await service.addLibrary({ name: libraryName });

    expect(dependencyMocks.ataSources).toEqual([expectedSource]);
  });

  it("unregisters a removed library's types and dependency state", async () => {
    dependencyMocks.typeFiles.set("alpha", [
      {
        content: "export declare const alpha: string;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    const { extraLibs, javascriptExtraLibs, service } = createService();

    await service.addLibrary({ name: "alpha" });
    expect(extraLibs.has("file:///node_modules/alpha/index.d.ts")).toBe(true);

    service.removeLibrary("alpha");

    expect(extraLibs.size).toBe(0);
    expect(javascriptExtraLibs.size).toBe(0);
    expect(useDependenciesStore.getState().dependencyMap.alpha).toBeUndefined();
  });

  it("fetches and registers a library again after removal", async () => {
    dependencyMocks.typeFiles.set("alpha", [
      {
        content: "export declare const alpha: string;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    const { extraLibs, service } = createService();

    await service.addLibrary({ name: "alpha" });
    service.removeLibrary("alpha");
    await service.addLibrary({ name: "alpha" });

    expect(dependencyMocks.cachedFetch).toHaveBeenCalledTimes(2);
    expect(extraLibs.has("file:///node_modules/alpha/index.d.ts")).toBe(true);
    expect(useDependenciesStore.getState().dependencyMap.alpha?.status).toBe("success");
  });

  it("reacquires types when dependency state outlives the service instance", async () => {
    dependencyMocks.typeFiles.set("alpha", [
      {
        content: "export declare const alpha: string;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    const first = createService();
    await first.service.addLibrary({ name: "alpha" });

    const second = createService();
    await second.service.addLibrary({ name: "alpha" });

    expect(dependencyMocks.cachedFetch).toHaveBeenCalledTimes(1);
    expect(second.extraLibs.has("file:///node_modules/alpha/index.d.ts")).toBe(true);
  });

  it("unregisters its types when the editor owner unmounts", async () => {
    dependencyMocks.typeFiles.set("alpha", [
      {
        content: "export declare const alpha: string;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    const { extraLibs, javascriptExtraLibs, service } = createService();
    await service.addLibrary({ name: "alpha" });

    service.unmountEditor();

    expect(extraLibs.size).toBe(0);
    expect(javascriptExtraLibs.size).toBe(0);
    expect(service.monaco).toBeNull();
  });

  it("prevents a disposed service from overwriting dependency state", async () => {
    const firstPackageFetch = createDeferred<Response>();
    dependencyMocks.cachedFetch.mockReset();
    dependencyMocks.cachedFetch
      .mockReturnValueOnce(firstPackageFetch.promise)
      .mockResolvedValueOnce(createPackageResponse());
    const first = createService();

    const staleInstallation = first.service.addLibrary({ name: "alpha" });
    first.service.dispose();

    dependencyMocks.typeErrors.set("alpha", new Error("Current type failure"));
    const second = createService();
    await second.service.addLibrary({ name: "alpha" });
    const currentError = useDependenciesStore.getState().dependencyMap.alpha?.error;

    firstPackageFetch.resolve(createPackageResponse());
    await staleInstallation;

    expect(currentError).toBe("Failed to acquire types: Current type failure");
    expect(useDependenciesStore.getState().dependencyMap.alpha?.error).toBe(currentError);
  });

  it("preserves another active library when one library is removed", async () => {
    dependencyMocks.typeFiles.set("alpha", [
      {
        content: "export declare const alpha: string;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    dependencyMocks.typeFiles.set("beta", [
      {
        content: "export declare const beta: string;",
        path: "/node_modules/beta/index.d.ts",
      },
    ]);
    const { extraLibs, service } = createService();
    await service.addLibrary({ name: "alpha" });
    await service.addLibrary({ name: "beta" });

    service.removeLibrary("alpha");

    expect(extraLibs.has("file:///node_modules/alpha/index.d.ts")).toBe(false);
    expect(extraLibs.has("file:///node_modules/beta/index.d.ts")).toBe(true);
    expect(useDependenciesStore.getState().dependencyMap.beta?.status).toBe("success");
  });

  it("removes types that are not declared by the current document", async () => {
    dependencyMocks.typeFiles.set("alpha", [
      {
        content: "export declare const alpha: string;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    const { extraLibs, service } = createService();
    await service.syncLibraries([{ name: "alpha" }]);

    await service.syncLibraries([]);

    expect(extraLibs.size).toBe(0);
    expect(useDependenciesStore.getState().dependencyMap).toEqual({});
  });

  it("marks a rejected package fetch as error and retries it", async () => {
    dependencyMocks.cachedFetch.mockRejectedValueOnce(new Error("Network unavailable"));
    const { service } = createService();

    await expect(service.addLibrary({ name: "alpha" })).resolves.toBeUndefined();

    expect(useDependenciesStore.getState().dependencyMap.alpha).toEqual(
      expect.objectContaining({
        status: "error",
        error: "Failed to fetch package.json: Network unavailable",
      }),
    );

    const retryFetch = createDeferred<Response>();
    dependencyMocks.cachedFetch.mockReturnValueOnce(retryFetch.promise);
    const retry = service.addLibrary({ name: "alpha" });

    expect(dependencyMocks.cachedFetch).toHaveBeenCalledTimes(2);
    expect(useDependenciesStore.getState().dependencyMap.alpha).toEqual(
      expect.objectContaining({
        status: "loading",
      }),
    );
    expect(useDependenciesStore.getState().dependencyMap.alpha?.error).toBeUndefined();
    retryFetch.resolve(createPackageResponse());
    await retry;

    expect(useDependenciesStore.getState().dependencyMap.alpha?.status).toBe("success");
  });

  it("deduplicates in-flight and completed installations", async () => {
    const packageFetch = createDeferred<Response>();
    dependencyMocks.cachedFetch.mockReturnValueOnce(packageFetch.promise);
    const { service } = createService();

    const firstInstallation = service.addLibrary({ name: "alpha" });
    const secondInstallation = service.addLibrary({ name: "alpha" });

    expect(dependencyMocks.cachedFetch).toHaveBeenCalledTimes(1);
    packageFetch.resolve(createPackageResponse());
    await Promise.all([firstInstallation, secondInstallation]);

    await service.addLibrary({ name: "alpha" });

    expect(dependencyMocks.cachedFetch).toHaveBeenCalledTimes(1);
    expect(useDependenciesStore.getState().dependencyMap.alpha?.status).toBe("success");
  });

  it("reports a non-OK package response as error", async () => {
    dependencyMocks.cachedFetch.mockResolvedValueOnce(
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    const { service } = createService();

    await service.addLibrary({ name: "alpha" });

    expect(useDependenciesStore.getState().dependencyMap.alpha).toEqual(
      expect.objectContaining({
        status: "error",
        error: "Failed to fetch package.json: Service Unavailable",
      }),
    );
  });

  it("includes the status code when a failed response has no status text", async () => {
    dependencyMocks.cachedFetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const { service } = createService();

    await service.addLibrary({ name: "alpha" });

    expect(useDependenciesStore.getState().dependencyMap.alpha).toEqual(
      expect.objectContaining({
        status: "error",
        error: "Failed to fetch package.json: HTTP 503",
      }),
    );
  });

  it("reports malformed package metadata as error", async () => {
    dependencyMocks.cachedFetch.mockResolvedValueOnce(new Response("{"));
    const { service } = createService();

    await service.addLibrary({ name: "alpha" });

    expect(useDependenciesStore.getState().dependencyMap.alpha).toEqual(
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("Failed to parse package.json:"),
      }),
    );
  });

  it("reports type acquisition failure and removes partial types", async () => {
    dependencyMocks.typeFiles.set("alpha", [
      {
        content: "export declare const alpha: string;",
        path: "/node_modules/alpha/index.d.ts",
      },
    ]);
    dependencyMocks.typeErrors.set("alpha", new Error("Type provider unavailable"));
    const { extraLibs, service } = createService();

    await service.addLibrary({ name: "alpha" });

    expect(useDependenciesStore.getState().dependencyMap.alpha).toEqual(
      expect.objectContaining({
        status: "error",
        error: "Failed to acquire types: Type provider unavailable",
      }),
    );
    expect(extraLibs.size).toBe(0);
  });
});
