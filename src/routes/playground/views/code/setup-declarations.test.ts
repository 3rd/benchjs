import assert from "node:assert/strict";
import ts from "typescript";
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
  it("exposes direct exports and writable aliases while hiding their private local names", async () => {
    const options: ts.CompilerOptions = {
      declaration: true,
      emitDeclarationOnly: true,
      noLib: true,
      skipLibCheck: true,
      types: [],
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    };
    const sources = new Map([
      ["/setup.ts", `export let count = 1; let value = 7; let same = 0; export { count as calls, value as answer, value as "quoted", same };`],
    ]);
    const host = ts.createCompilerHost(options);
    host.getSourceFile = (filename, languageVersion) => {
      const content = sources.get(filename);
      assert.ok(content !== undefined, `Missing source fixture: ${filename}`);

      return ts.createSourceFile(filename, content, languageVersion, true);
    };
    host.writeFile = (filename, content) => sources.set(filename, content);
    ts.createProgram(["/setup.ts"], options, host).emit();

    const emittedDeclarations = sources.get("/setup.d.ts");
    assert.ok(emittedDeclarations !== undefined, "Setup declarations were not emitted");

    const declarations = await generateSetupDeclarations({
      dependencyService: { syncLibraries: async () => {} },
      emitDeclarations: async () => emittedDeclarations,
      isCurrent: () => true,
      libraries: [],
    });
    assert.ok(declarations !== null, "Setup declarations were not generated");

    sources.set("/setup.d.ts", declarations);
    sources.set("/implementation.ts", `
      export const run = () => {
        count++;
        calls++;
        answer++;
        quoted++;
        same++;
        return [count, calls, answer];
      };
      export const leaked = value;
    `);

    const program = ts.createProgram(["/setup.d.ts", "/implementation.ts"], options, host);
    const diagnostics = program.getSemanticDiagnostics().map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    }));

    expect(diagnostics).toEqual([{ code: 2304, message: "Cannot find name 'value'." }]);
  });

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
  export declare const value: string;
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
  export type Local = number;
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
