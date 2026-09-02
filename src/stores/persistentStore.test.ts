import lz from "lz-string";

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lz;

const STORAGE_KEY = "persistent-store";

const createLegacyState = (content: string) => ({
  state: {
    version: 1,
    implementations: [{ id: "example", filename: "example.ts", content }],
    activeTabId: "example",
    setupCode: "const size = 10;",
    setupDTS: "declare const size: number;",
    readmeContent: "# Benchmark",
    libraries: [{ name: "lodash" }],
  },
  version: 1,
});

const createDocument = ({ id, implementationId, title }: { id: string; implementationId: string; title: string }) => ({
  id,
  title,
  lastModified: 1,
  implementations: [{ id: implementationId, filename: "example.ts", content: title }],
  activeTabId: implementationId,
  setupCode: "",
  setupDTS: "",
  readmeContent: "",
  libraries: [],
});

const createStoredState = (documents: ReturnType<typeof createDocument>[], currentDocumentId: string) =>
  JSON.stringify({
    state: {
      version: 2,
      documents,
      currentDocumentId,
    },
    version: 2,
  });

const installBrowserState = ({ localValue, hash = "" }: { localValue?: string; hash?: string } = {}) => {
  const values = new Map<string, string>();
  if (localValue) values.set(STORAGE_KEY, localValue);

  const locationState = {
    hash,
    pathname: "/playground",
    search: "",
  };

  vi.stubGlobal("window", {});
  vi.stubGlobal("location", locationState);
  vi.stubGlobal("history", {
    replaceState: (_data: unknown, _unused: string, url: string) => {
      const hashIndex = url.indexOf("#");
      locationState.hash = hashIndex === -1 ? "" : url.slice(hashIndex);
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });

  return { locationState, values };
};

const readUrlState = (hash: string): unknown => {
  const serialized = decompressFromEncodedURIComponent(hash.slice(2));
  return JSON.parse(serialized);
};

beforeEach(() => {
  vi.resetModules();
});

describe("persistent document store", () => {
  it("migrates the previous workspace into one document", async () => {
    const legacyState = JSON.stringify(createLegacyState("export const run = () => 1;"));
    const { locationState, values } = installBrowserState({
      localValue: legacyState,
    });

    const { getCurrentDocument, usePersistentStore } = await import("./persistentStore");
    const state = usePersistentStore.getState();
    const document = getCurrentDocument(state);

    expect(state.documents).toHaveLength(1);
    expect(document).toMatchObject({
      title: "Untitled",
      activeTabId: "example",
      implementations: [{ id: "example", content: "export const run = () => 1;" }],
      libraries: [{ name: "lodash" }],
    });
    expect(values.get(STORAGE_KEY)).toContain('"version":2');
    expect(locationState.hash).toMatch(/^#\//);
  });

  it("stores every document locally and only the active document in the URL", async () => {
    const { locationState, values } = installBrowserState();
    const { flushDocumentSaves, getCurrentDocument, usePersistentStore } = await import("./persistentStore");

    usePersistentStore.getState().renameDocument("First benchmark");
    flushDocumentSaves();
    expect(JSON.stringify(readUrlState(locationState.hash))).toContain("First benchmark");
    usePersistentStore.getState().createDocument();
    usePersistentStore.getState().renameDocument("Second benchmark");

    const state = usePersistentStore.getState();
    expect(state.documents.map((document) => document.title)).toEqual(["Second benchmark", "First benchmark"]);
    expect(getCurrentDocument(state).title).toBe("Second benchmark");
    expect(values.get(STORAGE_KEY)).toContain("First benchmark");
    expect(values.get(STORAGE_KEY)).toContain("Second benchmark");
    const urlState = readUrlState(locationState.hash);
    expect(urlState).toMatchObject({
      state: {
        documents: [{ title: "Second benchmark" }],
        currentDocumentId: state.currentDocumentId,
      },
      version: 2,
    });
    expect(JSON.stringify(urlState)).not.toContain("First benchmark");

    const firstDocumentId = state.documents[1].id;
    usePersistentStore.getState().setCurrentDocumentId(firstDocumentId);
    usePersistentStore.getState().removeDocument(firstDocumentId);
    expect(usePersistentStore.getState().documents).toHaveLength(1);
    expect(getCurrentDocument(usePersistentStore.getState()).title).toBe("Second benchmark");

    usePersistentStore.getState().removeDocument(usePersistentStore.getState().currentDocumentId);
    expect(usePersistentStore.getState().documents).toHaveLength(1);
    expect(getCurrentDocument(usePersistentStore.getState()).title).toBe("Untitled");
  });

  it("keeps each document's code, setup, declarations, README, and libraries isolated", async () => {
    installBrowserState();
    const { getCurrentDocument, usePersistentStore } = await import("./persistentStore");

    const firstState = usePersistentStore.getState();
    const firstDocumentId = firstState.currentDocumentId;
    const firstImplementationId = getCurrentDocument(firstState).implementations[0].id;
    firstState.updateImplementationCode(firstImplementationId, "export const value = 'first';");
    firstState.setSetupCode("export const input = 'first';");
    firstState.setSetupDTS("declare const input: 'first';");
    firstState.setReadmeContent("# First");
    firstState.addLibrary("first-library");

    usePersistentStore.getState().createDocument();
    const secondState = usePersistentStore.getState();
    const secondDocumentId = secondState.currentDocumentId;
    const secondImplementationId = getCurrentDocument(secondState).implementations[0].id;
    secondState.updateImplementationCode(secondImplementationId, "export const value = 'second';");
    secondState.setSetupCode("export const input = 'second';");
    secondState.setSetupDTS("declare const input: 'second';");
    secondState.setReadmeContent("# Second");
    secondState.addLibrary("second-library");

    usePersistentStore.getState().setCurrentDocumentId(firstDocumentId);
    expect(getCurrentDocument(usePersistentStore.getState())).toMatchObject({
      implementations: [{ id: firstImplementationId, content: "export const value = 'first';" }],
      setupCode: "export const input = 'first';",
      setupDTS: "declare const input: 'first';",
      readmeContent: "# First",
      libraries: [{ name: "first-library" }],
    });

    usePersistentStore.getState().setCurrentDocumentId(secondDocumentId);
    expect(getCurrentDocument(usePersistentStore.getState())).toMatchObject({
      implementations: [{ id: secondImplementationId, content: "export const value = 'second';" }],
      setupCode: "export const input = 'second';",
      setupDTS: "declare const input: 'second';",
      readmeContent: "# Second",
      libraries: [{ name: "second-library" }],
    });
  });

  it("imports a shared legacy workspace without replacing local documents or reusing implementation IDs", async () => {
    const localDocument = createDocument({
      id: "local",
      implementationId: "example",
      title: "Local",
    });
    const localValue = createStoredState([localDocument], localDocument.id);
    const sharedValue = JSON.stringify(createLegacyState("export const run = () => 'shared';"));
    installBrowserState({
      localValue,
      hash: `#/${compressToEncodedURIComponent(sharedValue)}`,
    });

    const { getCurrentDocument, usePersistentStore } = await import("./persistentStore");
    const state = usePersistentStore.getState();
    const implementationIds = state.documents.flatMap((document) =>
      document.implementations.map((implementation) => implementation.id),
    );

    expect(state.documents).toHaveLength(2);
    expect(state.documents.some((document) => document.title === "Local")).toBe(true);
    expect(getCurrentDocument(state).implementations[0].content).toBe("export const run = () => 'shared';");
    expect(new Set(implementationIds).size).toBe(implementationIds.length);
    expect(getCurrentDocument(state).activeTabId).not.toBe("example");
  });

  it("updates the matching local document from a shared URL without duplicating it", async () => {
    const localDocument = createDocument({
      id: "shared-document",
      implementationId: "local-run",
      title: "Local title",
    });
    const otherDocument = createDocument({
      id: "other-document",
      implementationId: "other-run",
      title: "Other",
    });
    const sharedDocument = {
      ...localDocument,
      title: "Shared title",
      lastModified: 2,
      implementations: [{ id: "shared-run", filename: "shared.ts", content: "shared" }],
      activeTabId: "shared-run",
    };
    const sharedValue = createStoredState([sharedDocument], sharedDocument.id);
    installBrowserState({
      localValue: createStoredState([localDocument, otherDocument], localDocument.id),
      hash: `#/${compressToEncodedURIComponent(sharedValue)}`,
    });

    const { getCurrentDocument, usePersistentStore } = await import("./persistentStore");
    const state = usePersistentStore.getState();

    expect(state.documents).toHaveLength(2);
    expect(getCurrentDocument(state)).toMatchObject({
      id: "shared-document",
      title: "Shared title",
      implementations: [{ id: "shared-run", filename: "shared.ts", content: "shared" }],
    });
    expect(state.documents.some((document) => document.id === "other-document")).toBe(true);
  });

  it("keeps valid local documents when the URL payload is invalid", async () => {
    const localDocument = createDocument({
      id: "local",
      implementationId: "local-run",
      title: "Local",
    });
    const { values } = installBrowserState({
      localValue: createStoredState([localDocument], localDocument.id),
      hash: "#/invalid",
    });

    const { getCurrentDocument, usePersistentStore } = await import("./persistentStore");

    expect(getCurrentDocument(usePersistentStore.getState()).title).toBe("Local");
    expect(values.get(STORAGE_KEY)).toContain("Local");
  });
});
