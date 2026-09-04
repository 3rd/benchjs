import lz from "lz-string";
import type { BenchmarkDocument } from "./persistentStore";

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lz;

const STORAGE_KEY = "persistent-store";
const PENDING_URL_HASH_KEY = "persistent-store-pending-url-hash";
const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

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

const createDocument = ({
  id,
  implementationId,
  title,
}: {
  id: string;
  implementationId: string;
  title: string;
}): BenchmarkDocument => ({
  id,
  title,
  lastModified: 1,
  implementations: [
    { id: implementationId, filename: "example.ts", content: title },
  ],
  activeTabId: implementationId,
  setupCode: "",
  setupDTS: "",
  readmeContent: "",
  libraries: [],
});

const createStoredState = (
  documents: BenchmarkDocument[],
  currentDocumentId: string,
) =>
  JSON.stringify({
    state: {
      version: 2,
      documents,
      currentDocumentId,
    },
    version: 2,
  });

const installBrowserState = ({
  localValues = new Map<string, string>(),
  localValue,
  hash = "",
  replaceStateCallLimit,
}: {
  localValues?: Map<string, string>;
  localValue?: string;
  hash?: string;
  replaceStateCallLimit?: number;
} = {}) => {
  if (localValue) localValues.set(STORAGE_KEY, localValue);
  let replaceStateCalls = 0;

  const locationState = {
    hash,
    pathname: "/playground",
    search: "",
  };

  vi.stubGlobal("window", {});
  vi.stubGlobal("location", locationState);
  vi.stubGlobal("history", {
    replaceState: (_data: unknown, _unused: string, url: string) => {
      replaceStateCalls += 1;
      if (
        replaceStateCallLimit !== undefined &&
        replaceStateCalls > replaceStateCallLimit
      ) {
        throw new DOMException(
          "Too many calls to history.replaceState",
          "SecurityError",
        );
      }
      const hashIndex = url.indexOf("#");
      locationState.hash = hashIndex === -1 ? "" : url.slice(hashIndex);
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => localValues.set(key, value),
    removeItem: (key: string) => localValues.delete(key),
  });

  return {
    getReplaceStateCalls: () => replaceStateCalls,
    locationState,
    values: localValues,
  };
};

const readUrlState = (hash: string): unknown => {
  const serialized = decompressFromEncodedURIComponent(hash.slice(2));
  return JSON.parse(serialized);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("persistent document store", () => {
  it("uses UUIDs for new documents and preserves existing persisted IDs", async () => {
    const existingDocument = createDocument({
      id: "default",
      implementationId: "example",
      title: "Existing document",
    });
    installBrowserState({
      localValue: createStoredState([existingDocument], existingDocument.id),
    });

    const { usePersistentStore } = await import("./persistentStore");
    expect(usePersistentStore.getState().currentDocumentId).toBe("default");

    usePersistentStore.getState().createDocument();

    expect(usePersistentStore.getState().currentDocumentId).toMatch(
      UUID_PATTERN,
    );
    expect(
      usePersistentStore
        .getState()
        .documents.some((document) => document.id === "default"),
    ).toBe(true);
  });

  it("coalesces rapid document updates into one URL write", async () => {
    const { getReplaceStateCalls, locationState } = installBrowserState();
    const { getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const implementationId = getCurrentDocument(usePersistentStore.getState())
      .implementations[0].id;

    for (let index = 0; index < 200; index += 1) {
      usePersistentStore
        .getState()
        .updateImplementationCode(implementationId, `content ${index}`);
    }

    expect(getReplaceStateCalls()).toBe(0);

    vi.advanceTimersByTime(300);

    expect(getReplaceStateCalls()).toBe(1);
    expect(readUrlState(locationState.hash)).toMatchObject({
      state: { documents: [{ implementations: [{ content: "content 199" }] }] },
    });
  });

  it("flushes the latest pending document before sharing", async () => {
    const { getReplaceStateCalls, locationState } = installBrowserState();
    const { flushDocumentSaves, getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const implementationId = getCurrentDocument(usePersistentStore.getState())
      .implementations[0].id;

    for (let index = 0; index < 200; index += 1) {
      usePersistentStore
        .getState()
        .updateImplementationCode(implementationId, `content ${index}`);
    }

    flushDocumentSaves();
    vi.advanceTimersByTime(300);

    expect(getReplaceStateCalls()).toBe(1);
    expect(readUrlState(locationState.hash)).toMatchObject({
      state: { documents: [{ implementations: [{ content: "content 199" }] }] },
    });
  });

  it("flushes the latest pending document before browser focus leaves", async () => {
    const { getReplaceStateCalls, locationState } = installBrowserState();
    const { flushPendingDocumentSave, getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const implementationId = getCurrentDocument(usePersistentStore.getState())
      .implementations[0].id;

    usePersistentStore
      .getState()
      .updateImplementationCode(implementationId, "latest content");
    flushPendingDocumentSave();
    vi.advanceTimersByTime(300);

    expect(getReplaceStateCalls()).toBe(1);
    expect(readUrlState(locationState.hash)).toMatchObject({
      state: {
        documents: [{ implementations: [{ content: "latest content" }] }],
      },
    });
  });

  it("persists the latest document locally before a URL update fails", async () => {
    const { locationState, values } = installBrowserState({
      replaceStateCallLimit: 1,
    });
    const { flushDocumentSaves, getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const implementationId = getCurrentDocument(usePersistentStore.getState())
      .implementations[0].id;

    flushDocumentSaves();

    for (let index = 0; index < 200; index += 1) {
      usePersistentStore
        .getState()
        .updateImplementationCode(implementationId, `content ${index}`);
    }

    expect(flushDocumentSaves).toThrow(DOMException);

    vi.clearAllTimers();
    vi.resetModules();
    installBrowserState({ localValues: values, hash: locationState.hash });
    const reloadedStore = await import("./persistentStore");
    const reloadedState = reloadedStore.usePersistentStore.getState();

    expect(
      reloadedStore.getCurrentDocument(reloadedState).implementations[0]
        .content,
    ).toBe("content 199");
  });

  it("restores the latest document after an immediate reload", async () => {
    const { locationState, values } = installBrowserState();
    const { flushDocumentSaves, getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const implementationId = getCurrentDocument(usePersistentStore.getState())
      .implementations[0].id;

    flushDocumentSaves();
    usePersistentStore
      .getState()
      .updateImplementationCode(implementationId, "saved before reload");

    vi.resetModules();
    installBrowserState({
      localValues: values,
      hash: locationState.hash,
    });
    const reloadedStore = await import("./persistentStore");
    const reloadedState = reloadedStore.usePersistentStore.getState();

    expect(reloadedState.documents).toHaveLength(1);
    expect(
      reloadedStore.getCurrentDocument(reloadedState).implementations[0]
        .content,
    ).toBe("saved before reload");
  });

  it("restores a pending local document in a new page session", async () => {
    const { locationState, values } = installBrowserState();
    const { flushDocumentSaves, getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");

    usePersistentStore.getState().createDocument();
    flushDocumentSaves();
    const staleHash = locationState.hash;
    const implementationId = getCurrentDocument(usePersistentStore.getState())
      .implementations[0].id;
    usePersistentStore
      .getState()
      .updateImplementationCode(implementationId, "latest local content");

    vi.clearAllTimers();
    vi.resetModules();
    installBrowserState({ localValues: values, hash: staleHash });
    const reloadedStore = await import("./persistentStore");

    expect(
      reloadedStore.getCurrentDocument(
        reloadedStore.usePersistentStore.getState(),
      ).implementations[0].content,
    ).toBe("latest local content");
  });

  it("does not write a pending document hash after leaving its route", async () => {
    const { getReplaceStateCalls, locationState, values } =
      installBrowserState();
    const { getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const implementationId = getCurrentDocument(usePersistentStore.getState())
      .implementations[0].id;

    usePersistentStore
      .getState()
      .updateImplementationCode(implementationId, "pending content");
    locationState.pathname = "/";
    vi.advanceTimersByTime(300);

    expect(getReplaceStateCalls()).toBe(0);
    expect(locationState.hash).toBe("");
    expect(values.has(PENDING_URL_HASH_KEY)).toBe(false);
  });

  it("migrates the previous workspace into one document", async () => {
    const legacyState = JSON.stringify(
      createLegacyState("export const run = () => 1;"),
    );
    const { locationState, values } = installBrowserState({
      localValue: legacyState,
    });

    const { getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const state = usePersistentStore.getState();
    const document = getCurrentDocument(state);

    expect(state.documents).toHaveLength(1);
    expect(document).toMatchObject({
      title: "Untitled",
      activeTabId: "example",
      implementations: [
        { id: "example", content: "export const run = () => 1;" },
      ],
      libraries: [{ name: "lodash" }],
    });
    expect(values.get(STORAGE_KEY)).toContain('"version":2');
    expect(locationState.hash).toMatch(/^#\//);
  });

  it("stores every document locally and only the active document in the URL", async () => {
    const { locationState, values } = installBrowserState();
    const { flushDocumentSaves, getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");

    usePersistentStore.getState().renameDocument("First benchmark");
    flushDocumentSaves();
    expect(JSON.stringify(readUrlState(locationState.hash))).toContain(
      "First benchmark",
    );
    usePersistentStore.getState().createDocument();
    usePersistentStore.getState().renameDocument("Second benchmark");

    const state = usePersistentStore.getState();
    expect(state.documents.map((document) => document.title)).toEqual([
      "Second benchmark",
      "First benchmark",
    ]);
    expect(getCurrentDocument(state).title).toBe("Second benchmark");
    expect(values.get(STORAGE_KEY)).toContain("First benchmark");
    expect(values.get(STORAGE_KEY)).toContain("Second benchmark");
    flushDocumentSaves();
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
    expect(getCurrentDocument(usePersistentStore.getState()).title).toBe(
      "Second benchmark",
    );

    usePersistentStore
      .getState()
      .removeDocument(usePersistentStore.getState().currentDocumentId);
    expect(usePersistentStore.getState().documents).toHaveLength(1);
    expect(getCurrentDocument(usePersistentStore.getState()).title).toBe(
      "Untitled",
    );
  });

  it("keeps each document's code, setup, declarations, README, and libraries isolated", async () => {
    installBrowserState();
    const { getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");

    const firstState = usePersistentStore.getState();
    const firstDocumentId = firstState.currentDocumentId;
    const firstImplementationId =
      getCurrentDocument(firstState).implementations[0].id;
    firstState.updateImplementationCode(
      firstImplementationId,
      "export const value = 'first';",
    );
    firstState.setSetupCode("export const input = 'first';");
    firstState.setSetupDTS("declare const input: 'first';");
    firstState.setReadmeContent("# First");
    firstState.addLibrary("first-library");

    usePersistentStore.getState().createDocument();
    const secondState = usePersistentStore.getState();
    const secondDocumentId = secondState.currentDocumentId;
    const secondImplementationId =
      getCurrentDocument(secondState).implementations[0].id;
    secondState.updateImplementationCode(
      secondImplementationId,
      "export const value = 'second';",
    );
    secondState.setSetupCode("export const input = 'second';");
    secondState.setSetupDTS("declare const input: 'second';");
    secondState.setReadmeContent("# Second");
    secondState.addLibrary("second-library");

    usePersistentStore.getState().setCurrentDocumentId(firstDocumentId);
    expect(getCurrentDocument(usePersistentStore.getState())).toMatchObject({
      implementations: [
        { id: firstImplementationId, content: "export const value = 'first';" },
      ],
      setupCode: "export const input = 'first';",
      setupDTS: "declare const input: 'first';",
      readmeContent: "# First",
      libraries: [{ name: "first-library" }],
    });

    usePersistentStore.getState().setCurrentDocumentId(secondDocumentId);
    expect(getCurrentDocument(usePersistentStore.getState())).toMatchObject({
      implementations: [
        {
          id: secondImplementationId,
          content: "export const value = 'second';",
        },
      ],
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
    const sharedValue = JSON.stringify(
      createLegacyState("export const run = () => 'shared';"),
    );
    installBrowserState({
      localValue,
      hash: `#/${compressToEncodedURIComponent(sharedValue)}`,
    });

    const { getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");
    const state = usePersistentStore.getState();
    const implementationIds = state.documents.flatMap((document) =>
      document.implementations.map((implementation) => implementation.id),
    );

    expect(state.documents).toHaveLength(2);
    expect(state.documents.some((document) => document.title === "Local")).toBe(
      true,
    );
    expect(getCurrentDocument(state).implementations[0].content).toBe(
      "export const run = () => 'shared';",
    );
    expect(new Set(implementationIds).size).toBe(implementationIds.length);
    expect(getCurrentDocument(state).activeTabId).not.toBe("example");
  });

  it("imports a document when a shared URL is pasted into the current page", async () => {
    const localDocument = createDocument({
      id: "local-document",
      implementationId: "local-run",
      title: "Local",
    });
    const sharedDocument = createDocument({
      id: "shared-document",
      implementationId: "shared-run",
      title: "Shared",
    });
    const { locationState } = installBrowserState({
      localValue: createStoredState([localDocument], localDocument.id),
    });
    const { getCurrentDocument, importDocumentFromUrl, usePersistentStore } =
      await import("./persistentStore");

    locationState.hash = `#/${compressToEncodedURIComponent(
      createStoredState([sharedDocument], sharedDocument.id),
    )}`;
    importDocumentFromUrl();

    const state = usePersistentStore.getState();
    expect(state.documents).toHaveLength(2);
    expect(getCurrentDocument(state)).toMatchObject({
      id: "shared-document",
      title: "Shared",
    });
  });

  it("keeps a pasted conflicting URL while waiting for a decision", async () => {
    const localDocument = createDocument({
      id: "shared-document",
      implementationId: "local-run",
      title: "Local",
    });
    const sharedDocument = createDocument({
      id: "shared-document",
      implementationId: "shared-run",
      title: "Shared",
    });
    const { locationState } = installBrowserState({
      localValue: createStoredState([localDocument], localDocument.id),
    });
    const {
      importDocumentFromUrl,
      useDocumentImportStore,
      usePersistentStore,
    } = await import("./persistentStore");
    usePersistentStore.getState().renameDocument("Pending local change");
    const sharedHash = `#/${compressToEncodedURIComponent(
      createStoredState([sharedDocument], sharedDocument.id),
    )}`;

    locationState.hash = sharedHash;
    importDocumentFromUrl();
    vi.advanceTimersByTime(300);

    expect(locationState.hash).toBe(sharedHash);
    expect(useDocumentImportStore.getState().conflictingDocument?.title).toBe(
      "Shared",
    );
  });

  it("keeps both legacy default documents when their content differs", async () => {
    const localDocument = createDocument({
      id: "default",
      implementationId: "local-run",
      title: "Local default",
    });
    const sharedDocument = createDocument({
      id: "default",
      implementationId: "shared-run",
      title: "Shared default",
    });
    installBrowserState({
      localValue: createStoredState([localDocument], localDocument.id),
      hash: `#/${compressToEncodedURIComponent(
        createStoredState([sharedDocument], sharedDocument.id),
      )}`,
    });

    const { getCurrentDocument, useDocumentImportStore, usePersistentStore } =
      await import("./persistentStore");
    const state = usePersistentStore.getState();

    expect(state.documents).toHaveLength(2);
    expect(
      state.documents.find((document) => document.id === "default")?.title,
    ).toBe("Local default");
    expect(getCurrentDocument(state).id).toMatch(UUID_PATTERN);
    expect(getCurrentDocument(state).title).toBe("Shared default");
    expect(useDocumentImportStore.getState().conflictingDocument).toBeNull();
  });

  it("waits for confirmation before overwriting a different document with the same ID", async () => {
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
      implementations: [
        { id: "shared-run", filename: "shared.ts", content: "shared" },
      ],
      activeTabId: "shared-run",
    };
    const sharedValue = createStoredState([sharedDocument], sharedDocument.id);
    const localValue = createStoredState(
      [localDocument, otherDocument],
      localDocument.id,
    );
    const { values } = installBrowserState({ localValue });
    const initialStore = await import("./persistentStore");
    initialStore.usePersistentStore
      .getState()
      .renameDocument("Pending local title");

    vi.clearAllTimers();
    vi.resetModules();
    installBrowserState({
      localValues: values,
      hash: `#/${compressToEncodedURIComponent(sharedValue)}`,
    });

    const { getCurrentDocument, useDocumentImportStore, usePersistentStore } =
      await import("./persistentStore");
    const stateBeforeResolution = usePersistentStore.getState();

    expect(stateBeforeResolution.documents).toHaveLength(2);
    expect(getCurrentDocument(stateBeforeResolution).title).toBe(
      "Pending local title",
    );
    expect(useDocumentImportStore.getState().conflictingDocument).toMatchObject(
      {
        id: "shared-document",
        title: "Shared title",
        implementations: [
          { id: "shared-run", filename: "shared.ts", content: "shared" },
        ],
      },
    );
    expect(values.get(STORAGE_KEY)).toContain("Pending local title");

    usePersistentStore.getState().resolveDocumentImport("overwrite");

    const resolvedState = usePersistentStore.getState();
    expect(resolvedState.documents).toHaveLength(2);
    expect(getCurrentDocument(resolvedState)).toMatchObject({
      id: "shared-document",
      title: "Shared title",
      implementations: [
        { id: "shared-run", filename: "shared.ts", content: "shared" },
      ],
    });
    expect(
      resolvedState.documents.some(
        (document) => document.id === "other-document",
      ),
    ).toBe(true);
    expect(useDocumentImportStore.getState().conflictingDocument).toBeNull();
  });

  it("imports different content with the same ID as a new document when requested", async () => {
    const localDocument = createDocument({
      id: "shared-document",
      implementationId: "shared-run",
      title: "Local title",
    });
    const sharedDocument = {
      ...localDocument,
      title: "Shared title",
      implementations: [
        { id: "shared-run", filename: "shared.ts", content: "shared" },
      ],
    };
    installBrowserState({
      localValue: createStoredState([localDocument], localDocument.id),
      hash: `#/${compressToEncodedURIComponent(
        createStoredState([sharedDocument], sharedDocument.id),
      )}`,
    });

    const { getCurrentDocument, useDocumentImportStore, usePersistentStore } =
      await import("./persistentStore");
    usePersistentStore.getState().resolveDocumentImport("copy");

    const state = usePersistentStore.getState();
    const importedDocument = getCurrentDocument(state);
    const implementationIds = state.documents.flatMap((document) =>
      document.implementations.map((implementation) => implementation.id),
    );
    expect(state.documents).toHaveLength(2);
    expect(
      state.documents.find((document) => document.id === "shared-document")
        ?.title,
    ).toBe("Local title");
    expect(importedDocument.id).toMatch(UUID_PATTERN);
    expect(importedDocument.id).not.toBe("shared-document");
    expect(importedDocument.title).toBe("Shared title");
    expect(new Set(implementationIds).size).toBe(implementationIds.length);
    expect(importedDocument.activeTabId).not.toBe("shared-run");
    expect(useDocumentImportStore.getState().conflictingDocument).toBeNull();
  });

  it("reopens identical document content without prompting or duplicating it", async () => {
    const localDocument = createDocument({
      id: "shared-document",
      implementationId: "shared-run",
      title: "Shared title",
    });
    const sharedDocument = {
      ...localDocument,
      lastModified: 2,
      activeTabId: null,
    };
    installBrowserState({
      localValue: createStoredState([localDocument], localDocument.id),
      hash: `#/${compressToEncodedURIComponent(
        createStoredState([sharedDocument], sharedDocument.id),
      )}`,
    });

    const { useDocumentImportStore, usePersistentStore } =
      await import("./persistentStore");
    const state = usePersistentStore.getState();

    expect(state.documents).toHaveLength(1);
    expect(state.currentDocumentId).toBe("shared-document");
    expect(useDocumentImportStore.getState().conflictingDocument).toBeNull();
  });

  it.each(["README.md", "setup.ts"])(
    "does not hydrate the reserved implementation ID %s from versioned documents",
    async (implementationId) => {
      const document = createDocument({
        id: "shadowed-document",
        implementationId,
        title: "Shadowed",
      });
      installBrowserState({
        localValue: createStoredState([document], document.id),
      });

      const { usePersistentStore } = await import("./persistentStore");
      const implementationIds = usePersistentStore
        .getState()
        .documents.flatMap((storedDocument) =>
          storedDocument.implementations.map(
            (implementation) => implementation.id,
          ),
        );

      expect(implementationIds).not.toContain(implementationId);
    },
  );

  it("does not hydrate reserved implementation IDs from legacy workspaces", async () => {
    const legacyState = createLegacyState("shadowed");
    legacyState.state.implementations[0].id = "README.md";
    legacyState.state.activeTabId = "README.md";
    installBrowserState({ localValue: JSON.stringify(legacyState) });

    const { usePersistentStore } = await import("./persistentStore");
    const implementationIds = usePersistentStore
      .getState()
      .documents.flatMap((document) =>
        document.implementations.map((implementation) => implementation.id),
      );

    expect(implementationIds).not.toContain("README.md");
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

    const { getCurrentDocument, usePersistentStore } =
      await import("./persistentStore");

    expect(getCurrentDocument(usePersistentStore.getState()).title).toBe(
      "Local",
    );
    expect(values.get(STORAGE_KEY)).toContain("Local");
  });
});
