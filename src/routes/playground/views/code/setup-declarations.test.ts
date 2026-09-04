import {
  generateSetupDeclarations,
  getCurrentSetupDeclarationContent,
  getSetupDeclarationIdentity,
} from "./setup-declarations";

const createDeferred = <Value>() => {
  let resolve: (value: Value) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("setup declaration generation", () => {
  it("waits for dependency types before emitting declarations", async () => {
    const dependencyTypes = createDeferred<void>();
    let inferredType = "any";
    const generation = generateSetupDeclarations({
      dependencyService: {
        syncLibraries: async () => {
          await dependencyTypes.promise;
          inferredType = "string";
        },
      },
      emitDeclarations: async () =>
        `export declare const value: ${inferredType};`,
      isCurrent: () => true,
      libraries: [{ name: "package@1" }],
    });

    await Promise.resolve();
    dependencyTypes.resolve(undefined);

    await expect(generation).resolves.toBe(`declare global {
  declare const value: string;
}

export {};`);
  });

  it("does not emit after its document environment becomes stale", async () => {
    const dependencyTypes = createDeferred<void>();
    let isCurrent = true;
    const generation = generateSetupDeclarations({
      dependencyService: {
        syncLibraries: async () => dependencyTypes.promise,
      },
      emitDeclarations: async () => "export declare const value: string;",
      isCurrent: () => isCurrent,
      libraries: [{ name: "package@1" }],
    });

    await Promise.resolve();
    isCurrent = false;
    dependencyTypes.resolve(undefined);

    await expect(generation).resolves.toBeNull();
  });

  it("preserves type re-exports while globalizing type aliases", async () => {
    const generation = generateSetupDeclarations({
      dependencyService: {
        syncLibraries: async () => {},
      },
      emitDeclarations: async () =>
        'export type { Shared } from "package";\nexport type Local = number;',
      isCurrent: () => true,
      libraries: [{ name: "package@1" }],
    });

    await expect(generation).resolves.toBe(`declare global {
  export type { Shared } from "package";
  type Local = number;
}

export {};`);
  });

  it("discards declarations when its document environment changes during emission", async () => {
    const emittedDeclarations = createDeferred<string | null>();
    let isCurrent = true;
    const generation = generateSetupDeclarations({
      dependencyService: {
        syncLibraries: async () => {},
      },
      emitDeclarations: async () => emittedDeclarations.promise,
      isCurrent: () => isCurrent,
      libraries: [{ name: "package@1" }],
    });

    await Promise.resolve();
    isCurrent = false;
    emittedDeclarations.resolve("export declare const value: string;");

    await expect(generation).resolves.toBeNull();
  });

  it("returns declarations only for the current package version", () => {
    const content = "declare const value: string;";
    const first = getSetupDeclarationIdentity({
      documentId: "document",
      libraries: [{ name: "beta@2" }, { name: "alpha@1" }],
      setupCode: "export const value = make();",
    });
    const reordered = getSetupDeclarationIdentity({
      documentId: "document",
      libraries: [{ name: "alpha@1" }, { name: "beta@2" }],
      setupCode: "export const value = make();",
    });
    const changedVersion = getSetupDeclarationIdentity({
      documentId: "document",
      libraries: [{ name: "alpha@2" }, { name: "beta@2" }],
      setupCode: "export const value = make();",
    });
    const setupDeclarations = { content, ...first };

    expect(
      getCurrentSetupDeclarationContent(setupDeclarations, reordered),
    ).toBe(content);
    expect(
      getCurrentSetupDeclarationContent(setupDeclarations, changedVersion),
    ).toBeNull();
  });
});
