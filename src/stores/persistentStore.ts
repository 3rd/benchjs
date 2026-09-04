import lz from "lz-string";
import { nanoid } from "nanoid";
import { create } from "zustand";
import {
  createJSONStorage,
  devtools,
  persist,
  StateStorage,
} from "zustand/middleware";
import {
  BUILT_IN_FILE_IDS,
  DEFAULT_IMPLEMENTATION,
  DEFAULT_SETUP_CODE,
  DEFAULT_SETUP_DTS,
  README_CONTENT,
} from "@/constants";

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lz;

export const DEFAULT_DOCUMENT_TITLE = "Untitled";

const CURRENT_VERSION = 2;
const LEGACY_DEFAULT_DOCUMENT_ID = "default";
const DOCUMENT_SAVE_DELAY_MS = 300;
const PENDING_URL_HASH_KEY = "persistent-store-pending-url-hash";
const PERSISTENT_STORE_NAME = "persistent-store";

export interface Implementation {
  id: string;
  filename: string;
  content: string;
}

export interface Library {
  name: string;
}

export interface BenchmarkDocument {
  id: string;
  title: string;
  lastModified: number;
  implementations: Implementation[];
  activeTabId: string | null;
  setupCode: string;
  setupDTS: string;
  readmeContent: string;
  libraries: Library[];
}

interface PersistedState {
  version: number;
  documents: BenchmarkDocument[];
  currentDocumentId: string;
}

interface StoredState {
  state: PersistedState;
  version: number;
}

interface LegacyPersistentState {
  implementations: Implementation[];
  activeTabId: string | null;
  setupCode: string;
  setupDTS: string;
  readmeContent: string;
  libraries: Library[];
}

export interface PersistentState extends PersistedState {
  createDocument: () => void;
  resolveDocumentImport: (resolution: "copy" | "overwrite") => void;
  removeDocument: (id: string) => void;
  renameDocument: (title: string) => void;
  setCurrentDocumentId: (id: string) => void;
  addImplementation: (implementation: Implementation) => void;
  updateImplementationCode: (id: string, content: string) => void;
  removeImplementation: (id: string) => void;
  renameImplementation: (id: string, filename: string) => void;
  setActiveTabId: (id: string | null) => void;
  setSetupCode: (code: string) => void;
  setSetupDTS: (code: string) => void;
  setReadmeContent: (content: string) => void;
  addLibrary: (name: string) => void;
  removeLibrary: (name: string) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isImplementation = (value: unknown): value is Implementation => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    !BUILT_IN_FILE_IDS.has(value.id) &&
    typeof value.filename === "string" &&
    typeof value.content === "string"
  );
};

const isLibrary = (value: unknown): value is Library => {
  return isRecord(value) && typeof value.name === "string";
};

const parseActiveTabId = (value: unknown) => {
  if (value === null || typeof value === "string") return value;
  return undefined;
};

const parseLegacyState = (value: unknown): LegacyPersistentState | null => {
  if (!isRecord(value)) return null;

  const activeTabId = parseActiveTabId(value.activeTabId);
  if (
    !Array.isArray(value.implementations) ||
    !value.implementations.every(isImplementation) ||
    activeTabId === undefined ||
    typeof value.setupCode !== "string" ||
    typeof value.setupDTS !== "string" ||
    typeof value.readmeContent !== "string" ||
    !Array.isArray(value.libraries) ||
    !value.libraries.every(isLibrary)
  ) {
    return null;
  }

  const activeTabIds = new Set([
    ...BUILT_IN_FILE_IDS,
    ...value.implementations.map((implementation) => implementation.id),
  ]);
  if (activeTabId !== null && !activeTabIds.has(activeTabId)) return null;

  return {
    implementations: value.implementations,
    activeTabId,
    setupCode: value.setupCode,
    setupDTS: value.setupDTS,
    readmeContent: value.readmeContent,
    libraries: value.libraries,
  };
};

const parseDocument = (value: unknown): BenchmarkDocument | null => {
  if (!isRecord(value)) return null;

  const activeTabId = parseActiveTabId(value.activeTabId);
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.lastModified !== "number" ||
    !Number.isFinite(value.lastModified) ||
    !Array.isArray(value.implementations) ||
    !value.implementations.every(isImplementation) ||
    activeTabId === undefined ||
    typeof value.setupCode !== "string" ||
    typeof value.setupDTS !== "string" ||
    typeof value.readmeContent !== "string" ||
    !Array.isArray(value.libraries) ||
    !value.libraries.every(isLibrary)
  ) {
    return null;
  }

  const implementationIds = new Set(
    value.implementations.map((implementation) => implementation.id),
  );
  if (implementationIds.size !== value.implementations.length) return null;
  if (
    activeTabId !== null &&
    !BUILT_IN_FILE_IDS.has(activeTabId) &&
    !implementationIds.has(activeTabId)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    lastModified: value.lastModified,
    implementations: value.implementations,
    activeTabId,
    setupCode: value.setupCode,
    setupDTS: value.setupDTS,
    readmeContent: value.readmeContent,
    libraries: value.libraries,
  };
};

const parsePersistedState = (value: unknown): PersistedState | null => {
  if (
    !isRecord(value) ||
    value.version !== CURRENT_VERSION ||
    !Array.isArray(value.documents) ||
    value.documents.length === 0 ||
    typeof value.currentDocumentId !== "string"
  ) {
    return null;
  }

  const documents: BenchmarkDocument[] = [];
  for (const valueDocument of value.documents) {
    const document = parseDocument(valueDocument);
    if (!document) return null;
    documents.push(document);
  }

  const documentIds = new Set(documents.map((document) => document.id));
  if (
    documentIds.size !== documents.length ||
    !documentIds.has(value.currentDocumentId)
  ) {
    return null;
  }

  const implementationIds = documents.flatMap((document) =>
    document.implementations.map((implementation) => implementation.id),
  );
  if (new Set(implementationIds).size !== implementationIds.length) return null;

  return {
    version: CURRENT_VERSION,
    documents,
    currentDocumentId: value.currentDocumentId,
  };
};

const createUniqueDocumentId = (usedIds: ReadonlySet<string> = new Set()) => {
  let id = crypto.randomUUID();
  while (usedIds.has(id)) id = crypto.randomUUID();
  return id;
};

const createUniqueImplementationId = (
  usedIds: ReadonlySet<string> = new Set(),
) => {
  let id = nanoid();
  while (usedIds.has(id)) id = nanoid();
  return id;
};

const createDefaultDocument = ({
  id = createUniqueDocumentId(),
  implementationId = createUniqueImplementationId(),
  title = DEFAULT_DOCUMENT_TITLE,
}: {
  id?: string;
  implementationId?: string;
  title?: string;
} = {}): BenchmarkDocument => ({
  id,
  title,
  lastModified: Date.now(),
  implementations: [
    {
      id: implementationId,
      filename: "example.ts",
      content: DEFAULT_IMPLEMENTATION,
    },
  ],
  activeTabId: null,
  setupCode: DEFAULT_SETUP_CODE,
  setupDTS: DEFAULT_SETUP_DTS,
  readmeContent: README_CONTENT,
  libraries: [],
});

const migrateLegacyState = (state: LegacyPersistentState): PersistedState => {
  const documentId = createUniqueDocumentId();
  return {
    version: CURRENT_VERSION,
    documents: [
      {
        id: documentId,
        title: DEFAULT_DOCUMENT_TITLE,
        lastModified: Date.now(),
        ...state,
      },
    ],
    currentDocumentId: documentId,
  };
};

const parseStoredState = (serialized: string): PersistedState | null => {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }

  if (
    !isRecord(value) ||
    !isRecord(value.state) ||
    typeof value.version !== "number"
  ) {
    return null;
  }

  if (value.version === CURRENT_VERSION) {
    return parsePersistedState(value.state);
  }
  if (value.version !== 1) return null;

  const legacyState = parseLegacyState(value.state);
  return legacyState ? migrateLegacyState(legacyState) : null;
};

const serializeStoredState = (state: PersistedState) => {
  const storedState: StoredState = {
    state,
    version: CURRENT_VERSION,
  };
  return JSON.stringify(storedState);
};

const getImplementationIds = (documents: BenchmarkDocument[]) => {
  return new Set(
    documents.flatMap((document) =>
      document.implementations.map((implementation) => implementation.id),
    ),
  );
};

const remapConflictingImplementationIds = (
  document: BenchmarkDocument,
  usedImplementationIds: Set<string>,
) => {
  const remappedIds = new Map<string, string>();
  const implementations = document.implementations.map((implementation) => {
    if (!usedImplementationIds.has(implementation.id)) {
      usedImplementationIds.add(implementation.id);
      return implementation;
    }

    const id = createUniqueImplementationId(usedImplementationIds);
    usedImplementationIds.add(id);
    remappedIds.set(implementation.id, id);
    return { ...implementation, id };
  });

  return {
    ...document,
    implementations,
    activeTabId:
      document.activeTabId && remappedIds.has(document.activeTabId)
        ? (remappedIds.get(document.activeTabId) ?? null)
        : document.activeTabId,
  };
};

const getDocumentContent = (document: BenchmarkDocument) => {
  return {
    title: document.title,
    implementations: document.implementations,
    setupCode: document.setupCode,
    setupDTS: document.setupDTS,
    readmeContent: document.readmeContent,
    libraries: document.libraries,
  };
};

const documentContentsMatch = (
  left: BenchmarkDocument,
  right: BenchmarkDocument,
) =>
  JSON.stringify(getDocumentContent(left)) ===
  JSON.stringify(getDocumentContent(right));

const mergeUrlState = (
  localState: PersistedState | null,
  urlState: PersistedState | null,
) => {
  if (!urlState) return { state: localState, conflictingDocument: null };

  const urlDocument = urlState.documents.find(
    (document) => document.id === urlState.currentDocumentId,
  );
  if (!urlDocument || urlState.documents.length !== 1) {
    return { state: localState, conflictingDocument: null };
  }

  if (!localState) {
    return {
      state: {
        version: CURRENT_VERSION,
        documents: [urlDocument],
        currentDocumentId: urlDocument.id,
      },
      conflictingDocument: null,
    };
  }

  const localDocument = localState.documents.find(
    (document) => document.id === urlDocument.id,
  );
  let nextDocumentId = urlDocument.id;
  let nextUrlDocument = urlDocument;

  if (localDocument && !documentContentsMatch(localDocument, urlDocument)) {
    if (urlDocument.id !== LEGACY_DEFAULT_DOCUMENT_ID) {
      return { state: localState, conflictingDocument: urlDocument };
    }

    const usedDocumentIds = new Set(
      localState.documents.map((document) => document.id),
    );
    nextDocumentId = createUniqueDocumentId(usedDocumentIds);
    nextUrlDocument = { ...urlDocument, id: nextDocumentId };
  } else if (localDocument) {
    nextUrlDocument = {
      ...localDocument,
      activeTabId: urlDocument.activeTabId,
    };
  }

  const retainedDocuments = localState.documents.filter(
    (document) => document.id !== nextDocumentId,
  );
  const usedImplementationIds = getImplementationIds(retainedDocuments);
  nextUrlDocument = remapConflictingImplementationIds(
    nextUrlDocument,
    usedImplementationIds,
  );

  return {
    state: {
      version: CURRENT_VERSION,
      documents: [nextUrlDocument, ...retainedDocuments].sort(
        (left, right) => right.lastModified - left.lastModified,
      ),
      currentDocumentId: nextDocumentId,
    },
    conflictingDocument: null,
  };
};

interface DocumentImportState {
  conflictingDocument: BenchmarkDocument | null;
}

export const useDocumentImportStore = create<DocumentImportState>()(() => ({
  conflictingDocument: null,
}));

const resolveDocumentImportState = (
  state: PersistedState,
  document: BenchmarkDocument,
  resolution: "copy" | "overwrite",
) => {
  const retainedDocuments =
    resolution === "overwrite"
      ? state.documents.filter((item) => item.id !== document.id)
      : state.documents;
  const usedDocumentIds = new Set(retainedDocuments.map((item) => item.id));
  const documentId =
    resolution === "copy"
      ? createUniqueDocumentId(usedDocumentIds)
      : document.id;
  const nextDocument = remapConflictingImplementationIds(
    {
      ...document,
      id: documentId,
      lastModified: resolution === "copy" ? Date.now() : document.lastModified,
    },
    getImplementationIds(retainedDocuments),
  );

  return {
    documents: [nextDocument, ...retainedDocuments].sort(
      (left, right) => right.lastModified - left.lastModified,
    ),
    currentDocumentId: documentId,
  };
};

const saveUrlState = (state: PersistedState) => {
  const currentDocument = state.documents.find(
    (document) => document.id === state.currentDocumentId,
  );
  if (!currentDocument) throw new Error("Current document not found");

  const serialized = serializeStoredState({
    version: CURRENT_VERSION,
    documents: [currentDocument],
    currentDocumentId: currentDocument.id,
  });
  const compressed = compressToEncodedURIComponent(serialized);
  const hash = `#/${compressed}`;
  history.replaceState(null, "", hash);
  if (location.hash === hash) localStorage.removeItem(PENDING_URL_HASH_KEY);
};

const persistDocumentState = (key: string, state: PersistedState) => {
  const serialized = serializeStoredState(state);
  localStorage.setItem(key, serialized);
  saveUrlState(state);
  return serialized;
};

type PendingUrlSave = {
  serialized: string;
  pathname: string;
  search: string;
};

let pendingUrlSave: PendingUrlSave | null = null;
let urlSaveTimer: ReturnType<typeof setTimeout> | null = null;

const cancelPendingUrlSave = () => {
  if (!pendingUrlSave) return;

  if (urlSaveTimer !== null) clearTimeout(urlSaveTimer);
  pendingUrlSave = null;
  urlSaveTimer = null;
};

const flushPendingUrlSave = () => {
  const pending = pendingUrlSave;
  if (!pending) return;

  cancelPendingUrlSave();
  if (
    location.pathname !== pending.pathname ||
    location.search !== pending.search
  ) {
    localStorage.removeItem(PENDING_URL_HASH_KEY);
    return;
  }

  const state = parseStoredState(pending.serialized);
  if (!state) throw new Error("Invalid persistent store state");

  saveUrlState(state);
};

const scheduleUrlSave = (serialized: string) => {
  if (pendingUrlSave) {
    pendingUrlSave.serialized = serialized;
  } else {
    pendingUrlSave = {
      serialized,
      pathname: location.pathname,
      search: location.search,
    };
    localStorage.setItem(PENDING_URL_HASH_KEY, location.hash);
  }
  if (urlSaveTimer !== null) clearTimeout(urlSaveTimer);
  urlSaveTimer = setTimeout(flushPendingUrlSave, DOCUMENT_SAVE_DELAY_MS);
};

const readUrlState = () => {
  if (!location.hash.startsWith("#/")) {
    return { serialized: null, state: null };
  }

  const serialized = decompressFromEncodedURIComponent(location.hash.slice(2));
  return {
    serialized,
    state: serialized ? parseStoredState(serialized) : null,
  };
};

const documentStorage: StateStorage = {
  getItem: (key): string | null => {
    if (typeof window === "undefined") return null;

    try {
      const localSerialized = localStorage.getItem(key);
      const localState = localSerialized
        ? parseStoredState(localSerialized)
        : null;

      const { serialized: urlSerialized, state: urlState } = readUrlState();
      const urlHasPendingLocalState =
        location.hash === localStorage.getItem(PENDING_URL_HASH_KEY);
      let result: ReturnType<typeof mergeUrlState>;
      if (localState && urlHasPendingLocalState) {
        result = { state: localState, conflictingDocument: null };
      } else if (localSerialized === urlSerialized) {
        result = { state: localState, conflictingDocument: null };
      } else {
        result = mergeUrlState(localState, urlState);
      }
      useDocumentImportStore.setState({
        conflictingDocument: result.conflictingDocument,
      });
      if (!result.state) return null;

      if (result.conflictingDocument) {
        localStorage.removeItem(PENDING_URL_HASH_KEY);
        return serializeStoredState(result.state);
      }

      return persistDocumentState(key, result.state);
    } catch (error) {
      console.error("Error reading store:", error);
      return null;
    }
  },
  setItem: (key, newValue): void => {
    if (typeof window === "undefined") return;

    localStorage.setItem(key, newValue);
    scheduleUrlSave(newValue);
  },
  removeItem: (key): void => {
    if (typeof window === "undefined") return;

    cancelPendingUrlSave();
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    localStorage.removeItem(PENDING_URL_HASH_KEY);
    localStorage.removeItem(key);
  },
};

export const getCurrentDocument = (state: PersistedState) => {
  const document = state.documents.find(
    (item) => item.id === state.currentDocumentId,
  );
  if (!document) throw new Error("Current document not found");
  return document;
};

const updateCurrentDocument = (
  state: PersistentState,
  update: (document: BenchmarkDocument) => BenchmarkDocument,
  touch = true,
) => {
  const documents = state.documents.map((document) => {
    if (document.id !== state.currentDocumentId) return document;
    const updatedDocument = update(document);
    return touch
      ? { ...updatedDocument, lastModified: Date.now() }
      : updatedDocument;
  });

  return touch
    ? documents.sort((left, right) => right.lastModified - left.lastModified)
    : documents;
};

const defaultDocument = createDefaultDocument();

export const usePersistentStore = create<PersistentState>()(
  devtools(
    persist(
      (set) => ({
        version: CURRENT_VERSION,
        documents: [defaultDocument],
        currentDocumentId: defaultDocument.id,

        createDocument: () =>
          set((state) => {
            const usedDocumentIds = new Set(
              state.documents.map((document) => document.id),
            );
            const usedImplementationIds = getImplementationIds(state.documents);
            const document = createDefaultDocument({
              id: createUniqueDocumentId(usedDocumentIds),
              implementationId: createUniqueImplementationId(
                usedImplementationIds,
              ),
            });
            return {
              documents: [document, ...state.documents],
              currentDocumentId: document.id,
            };
          }),
        resolveDocumentImport: (resolution) => {
          const document =
            useDocumentImportStore.getState().conflictingDocument;
          if (!document) return;

          set((state) =>
            resolveDocumentImportState(state, document, resolution),
          );
          useDocumentImportStore.setState({ conflictingDocument: null });
        },
        removeDocument: (id) =>
          set((state) => {
            if (!state.documents.some((document) => document.id === id)) {
              return state;
            }

            let documents = state.documents.filter(
              (document) => document.id !== id,
            );
            if (documents.length === 0) {
              const usedDocumentIds = new Set(
                state.documents.map((document) => document.id),
              );
              const usedImplementationIds = getImplementationIds(
                state.documents,
              );
              documents = [
                createDefaultDocument({
                  id: createUniqueDocumentId(usedDocumentIds),
                  implementationId: createUniqueImplementationId(
                    usedImplementationIds,
                  ),
                }),
              ];
            }

            return {
              documents,
              currentDocumentId:
                state.currentDocumentId === id
                  ? documents[0].id
                  : state.currentDocumentId,
            };
          }),
        renameDocument: (title) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              title,
            })),
          })),
        setCurrentDocumentId: (id) =>
          set((state) => {
            if (!state.documents.some((document) => document.id === id)) {
              return state;
            }
            return { currentDocumentId: id };
          }),

        addImplementation: (implementation) =>
          set((state) => {
            if (getImplementationIds(state.documents).has(implementation.id)) {
              throw new Error("Implementation ID already exists");
            }
            return {
              documents: updateCurrentDocument(state, (document) => ({
                ...document,
                implementations: [...document.implementations, implementation],
              })),
            };
          }),
        updateImplementationCode: (id, content) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              implementations: document.implementations.map((implementation) =>
                implementation.id === id
                  ? { ...implementation, content }
                  : implementation,
              ),
            })),
          })),
        renameImplementation: (id, filename) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              implementations: document.implementations.map((implementation) =>
                implementation.id === id
                  ? { ...implementation, filename }
                  : implementation,
              ),
            })),
          })),
        removeImplementation: (id) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              implementations: document.implementations.filter(
                (implementation) => implementation.id !== id,
              ),
              activeTabId:
                document.activeTabId === id ? null : document.activeTabId,
            })),
          })),
        setActiveTabId: (id) =>
          set((state) => ({
            documents: updateCurrentDocument(
              state,
              (document) => ({ ...document, activeTabId: id }),
              false,
            ),
          })),
        setSetupCode: (setupCode) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              setupCode,
            })),
          })),
        setSetupDTS: (setupDTS) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              setupDTS,
            })),
          })),
        setReadmeContent: (readmeContent) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              readmeContent,
            })),
          })),
        addLibrary: (name) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              libraries: [...document.libraries, { name }],
            })),
          })),
        removeLibrary: (name) =>
          set((state) => ({
            documents: updateCurrentDocument(state, (document) => ({
              ...document,
              libraries: document.libraries.filter(
                (library) => library.name !== name,
              ),
            })),
          })),
      }),
      {
        name: PERSISTENT_STORE_NAME,
        storage: createJSONStorage(() => documentStorage),
        version: CURRENT_VERSION,
      },
    ),
  ),
);

export const flushDocumentSaves = () => {
  if (typeof window === "undefined") return;

  cancelPendingUrlSave();
  const state = usePersistentStore.getState();
  const persistedState: PersistedState = {
    version: state.version,
    documents: state.documents,
    currentDocumentId: state.currentDocumentId,
  };
  persistDocumentState(PERSISTENT_STORE_NAME, persistedState);
};

export const flushPendingDocumentSave = () => {
  if (typeof window === "undefined") return;

  flushPendingUrlSave();
};

export const importDocumentFromUrl = () => {
  if (typeof window === "undefined") return;

  try {
    if (location.hash === localStorage.getItem(PENDING_URL_HASH_KEY)) {
      flushDocumentSaves();
      return;
    }

    const { state: urlState } = readUrlState();
    if (!urlState) {
      useDocumentImportStore.setState({ conflictingDocument: null });
      return;
    }

    cancelPendingUrlSave();
    localStorage.removeItem(PENDING_URL_HASH_KEY);

    const currentState = usePersistentStore.getState();
    const localState: PersistedState = {
      version: currentState.version,
      documents: currentState.documents,
      currentDocumentId: currentState.currentDocumentId,
    };
    const result = mergeUrlState(localState, urlState);
    useDocumentImportStore.setState({
      conflictingDocument: result.conflictingDocument,
    });
    if (!result.state || result.conflictingDocument) return;

    usePersistentStore.setState({
      documents: result.state.documents,
      currentDocumentId: result.state.currentDocumentId,
    });
  } catch (error) {
    console.error("Error importing document from URL:", error);
  }
};
