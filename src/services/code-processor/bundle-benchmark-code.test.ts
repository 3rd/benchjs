import type { Library } from "@/stores/persistentStore";
import { transform } from "./babel";
import { buildImportTransformPlugin, bundleBenchmarkCode } from "./bundle-benchmark-code";

const BLACKHOLE_PREAMBLE =
  /^var __benchmateBlackhole = globalThis\.__benchmateBlackhole \?\? \(\((\w+)\) => \1\);$/;
const DEFAULT_EXPORT_FOOTER = /export {\n {2}[\w$]+ as default\n};$/;

const bundleRunBody = async (userCode: string, setupCode = "") => {
  const bundle = await bundleBenchmarkCode(userCode, setupCode);
  const lines = bundle.trimEnd().split("\n");

  expect(lines[0], bundle).toMatch(/^\/\/ /);
  expect(lines[1], bundle).toMatch(BLACKHOLE_PREAMBLE);

  const body = lines.slice(2).join("\n");
  const defaultExportIndex = body.search(DEFAULT_EXPORT_FOOTER);
  expect(defaultExportIndex, bundle).toBeGreaterThanOrEqual(0);

  return body.slice(0, defaultExportIndex).trim();
};

const executeBundledRun = async (
  userCode: string,
  { setupCode = "", args = [] }: { setupCode?: string; args?: unknown[] } = {},
) => {
  const bundle = await bundleBenchmarkCode(userCode, setupCode);
  const module: unknown = await import(
    `data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}#${crypto.randomUUID()}`
  );
  if (
    !module ||
    typeof module !== "object" ||
    !("default" in module) ||
    typeof module.default !== "function"
  ) {
    throw new Error("Expected the benchmark bundle to export a default function");
  }
  return module.default(...args);
};

const SYNC_RUN = "function run() {\n  return 42;\n}";
const ASYNC_RUN = "async function run() {\n  return 42;\n}";

const transformImportSource = async (source: string, libraries: Library[]) => {
  const transformedCode = await transform(`import dependency from "${source}";`, "main.ts", [
    buildImportTransformPlugin(libraries),
  ]);
  const importMatch = /^import dependency from "([^"]+)";/.exec(transformedCode);
  if (!importMatch) throw new Error(`Expected one dependency import, received: ${transformedCode}`);
  return importMatch[1];
};

describe("bundleBenchmarkCode", () => {
  beforeEach(() => {
    vi.stubGlobal("location", new URL("https://benchjs.test"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("import transformation", () => {
    it.each([
      {
        name: "a version-pinned package",
        source: "lodash",
        libraries: [{ name: "lodash@4.17.21" }],
        expected: "https://esm.sh/lodash@4.17.21",
      },
      {
        name: "an unversioned package",
        source: "lodash",
        libraries: [{ name: "lodash" }],
        expected: "https://esm.sh/lodash",
      },
      {
        name: "a version-pinned package subpath",
        source: "lodash/debounce",
        libraries: [{ name: "lodash@4.17.21" }],
        expected: "https://esm.sh/lodash@4.17.21/debounce",
      },
      {
        name: "a version-qualified package subpath",
        source: "lodash@4.17.21/debounce",
        libraries: [{ name: "lodash@4.17.21" }],
        expected: "https://esm.sh/lodash@4.17.21/debounce",
      },
      {
        name: "an unversioned package subpath",
        source: "lodash/debounce",
        libraries: [{ name: "lodash" }],
        expected: "https://esm.sh/lodash/debounce",
      },
      {
        name: "a version-pinned scoped package subpath",
        source: "@scope/package/subpath",
        libraries: [{ name: "@scope/package@1.2.3" }],
        expected: "https://esm.sh/@scope/package@1.2.3/subpath",
      },
      {
        name: "a version-qualified scoped package subpath",
        source: "@scope/package@1.2.3/subpath",
        libraries: [{ name: "@scope/package@1.2.3" }],
        expected: "https://esm.sh/@scope/package@1.2.3/subpath",
      },
      {
        name: "the complete stored package spec",
        source: "lodash@4.17.21",
        libraries: [{ name: "lodash@4.17.21" }],
        expected: "https://esm.sh/lodash@4.17.21",
      },
    ])("should rewrite $name", async ({ source, libraries, expected }) => {
      expect(await transformImportSource(source, libraries)).toBe(expected);
    });

    it("should leave an unmatched import source unchanged", async () => {
      expect(await transformImportSource("lodash", [])).toBe("lodash");
    });
  });

  describe("run function normalization", () => {
    it.each([
      ["named run arrow function export", `export const run = () => { return 42; }`, SYNC_RUN],
      ["named run arrow function export with implicit return", `export const run = () => 42`, SYNC_RUN],
      ["async named run arrow function export", `export const run = async () => { return 42; }`, ASYNC_RUN],
      ["named run function expression export", `export const run = function() { return 42; }`, SYNC_RUN],
      [
        "async named run function expression export",
        `export const run = async function() { return 42; }`,
        ASYNC_RUN,
      ],
      ["named run function declaration export", `export function run() { return 42; }`, SYNC_RUN],
      [
        "async named run function declaration export",
        `export async function run() { return 42; }`,
        ASYNC_RUN,
      ],
      ["default export arrow function", `export default () => { return 42; }`, SYNC_RUN],
      ["default export arrow function with implicit return", `export default () => 42`, SYNC_RUN],
      ["async default export arrow function", `export default async () => { return 42; }`, ASYNC_RUN],
      ["default export function expression", `export default function() { return 42; }`, SYNC_RUN],
      [
        "async default export function expression",
        `export default async function() { return 42; }`,
        ASYNC_RUN,
      ],
      [
        "default export named function expression",
        `export default function test() { return 42; }`,
        "function test() {\n  return 42;\n}",
      ],
      [
        "async default export named function expression",
        `export default async function test() { return 42; }`,
        "async function test() {\n  return 42;\n}",
      ],
    ])("should normalize %s to a default function", async (_name, code, expected) => {
      expect(await bundleRunBody(code)).toBe(expected);
    });

    it.each([
      ["a named export list", `const run = () => 42; export { run };`],
      ["a function declaration export list", `function run() { return 42; } export { run };`],
      ["an aliased named export list", `const benchmark = () => 42; export { benchmark as run };`],
      ["a default export list", `const run = () => 42; export { run as default };`],
      ["an identifier default export", `const run = () => 42; export default run;`],
    ])("should preserve the callable from %s", async (_name, code) => {
      expect(await executeBundledRun(code)).toBe(42);
    });

    it.each([
      [
        "first",
        `export const run = () => [first + second, ...order],
          first = (order.push("first"), 3),
          second = (order.push("second"), 4);`,
      ],
      [
        "between siblings",
        `export const first = (order.push("first"), 3),
          run = () => [first + second, ...order],
          second = (order.push("second"), 4);`,
      ],
      [
        "last",
        `export var first = (order.push("first"), 3),
          second = (order.push("second"), 4),
          run = () => [first + second, ...order];`,
      ],
    ])("should preserve sibling initialization when run is %s", async (_position, declaration) => {
      expect(
        await executeBundledRun(`const order: string[] = []; ${declaration}`),
      ).toEqual([7, "first", "second"]);
    });

    it("should expose only the benchmark callable from a grouped export", async () => {
      const bundle = await bundleBenchmarkCode(
        `export const run = () => 7, label = "sample";`,
        "",
      );

      const module: unknown = await import(
        `data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`
      );
      assert(module && typeof module === "object");
      expect(Object.keys(module)).toEqual(["default"]);
      assert("default" in module && typeof module.default === "function");
      expect(module.default()).toBe(7);
    });

    it("should preserve sibling helpers and both recursive bindings in a grouped export", async () => {
      expect(
        await executeBundledRun(
          `
            export const step = (n: number) => n - 1,
              run = function recurse(n: number): number {
                if (n === 0) return value;
                if (n % 2 === 0) return run(step(n));
                return recurse(step(n));
              },
              value = 7;
          `,
          { args: [5] },
        ),
      ).toBe(7);
    });

    it("should reject a reassigned run binding in a grouped export", async () => {
      await expect(
        bundleBenchmarkCode(
          `export let run = () => "first", label = "sample"; run = () => "second";`,
          "",
        ),
      ).rejects.toThrow("The benchmark run function must not be reassigned");
    });

    it.each([
      [
        "an annotated local in a run arrow body",
        `export const run = () => { const x: number = 0; return x; };`,
        0,
      ],
      ["a run function declaration return type", `export function run(): number { return 1; }`, 1],
      ["a typed parameter of a default arrow export", `export default (n: number = 3) => n;`, 3],
    ])("should erase TypeScript syntax from %s", async (_name, code, expected) => {
      expect(await executeBundledRun(code)).toBe(expected);
    });

    it("should reject a reassigned run binding instead of benchmarking its original value", async () => {
      await expect(
        bundleBenchmarkCode(
          `
            let run = () => "first";
            export { run };
            run = () => "second";
          `,
          "",
        ),
      ).rejects.toThrow("The benchmark run function must not be reassigned");
    });

    it("should preserve a recursive named default function binding", async () => {
      expect(
        await executeBundledRun(
          `
          export default function recurse(n) {
            return n === 0 ? 0 : recurse(n - 1);
          }
        `,
          { args: [5] },
        ),
      ).toBe(0);
    });

    it("should preserve both bindings of a recursive named function expression", async () => {
      expect(
        await executeBundledRun(
          `
          export const run = function recurse(n) {
            if (n === 0) return 0;
            return n % 2 === 0 ? run(n - 1) : recurse(n - 1);
          };
        `,
          { args: [5] },
        ),
      ).toBe(0);
    });
  });

  describe("blackhole protection", () => {
    it("should wrap discarded expression statements in the run body", async () => {
      const body = await bundleRunBody(`
        export const run = () => {
          data.reduce(sum, 0);
        };
      `);

      expect(body).toBe("function run() {\n  __benchmateBlackhole(data.reduce(sum, 0));\n}");
    });

    it("should leave returns and assignments unwrapped", async () => {
      const body = await bundleRunBody(`
        export const run = () => {
          let total = 0;
          total += compute();
          return total;
        };
      `);

      expect(body).toBe("function run() {\n  let total = 0;\n  total += compute();\n  return total;\n}");
    });

    it("should protect a run function resolved from an export list", async () => {
      const body = await bundleRunBody(`
        const run = () => {
          data.reduce(sum, 0);
        };
        export { run };
      `);

      expect(body).toContain("__benchmateBlackhole(data.reduce(sum, 0));");
    });

    it("should protect a typed run body in a grouped export", async () => {
      const discardedValues: unknown[] = [];
      vi.stubGlobal("__benchmateBlackhole", (value: unknown) => {
        discardedValues.push(value);
      });

      expect(
        await executeBundledRun(`
          export const run = (input: number = 3): number => {
            const value: number = input * 2;
            value + 1;
            return value;
          }, label = "sample";
        `),
      ).toBe(6);
      expect(discardedValues).toEqual([7]);
    });
  });

  describe("strip exports plugin", () => {
    const VALUE_MODULE = "var value = 42;\nfunction run() {\n  return value;\n}";
    const ABC_MODULE = "var a = 1;\nvar b = 2;\nvar c = 3;\nfunction run() {\n  return a + b + c;\n}";

    it("should strip named exports with declarations", async () => {
      const body = await bundleRunBody(`
        export const value = 42;
        export const run = () => value;
      `);

      expect(body).toBe(VALUE_MODULE);
    });

    it("should strip named exports without declarations", async () => {
      const body = await bundleRunBody(`
        const value = 42;
        export { value };
        export const run = () => value;
      `);

      expect(body).toBe(VALUE_MODULE);
    });

    it("should strip unrelated specifiers exported with run", async () => {
      const body = await bundleRunBody(`
        const value = 42;
        const run = () => value;
        export { value, run };
      `);

      expect(body).toContain("var value = 42;");
      expect(body).not.toContain("value as");
    });

    it("should strip multiple named exports", async () => {
      const body = await bundleRunBody(`
        export const a = 1;
        export const b = 2;
        export const c = 3;
        export const run = () => a + b + c;
      `);

      expect(body).toBe(ABC_MODULE);
    });

    it("should strip mixed named exports and declarations", async () => {
      const body = await bundleRunBody(`
        const a = 1;
        export { a };
        export const b = 2;
        const c = 3;
        export { c as d };
        export const run = () => a + b + c;
      `);

      expect(body).toBe(ABC_MODULE);
    });

    it("should strip type exports", async () => {
      const body = await bundleRunBody(`
        export type Value = number;
        export interface IValue { value: number }
        export const value = 42;
        export const run = () => value;
      `);

      expect(body).toBe(VALUE_MODULE);
    });
  });

  describe("setup code", () => {
    it("should expose a setup binding by its exported alias", async () => {
      expect(
        await executeBundledRun(`export const run = () => answer;`, {
          setupCode: `const value = 7; export { value as answer };`,
        }),
      ).toBe(7);
    });

    it("should preserve an alias when its internal name matches another setup export", async () => {
      expect(
        await executeBundledRun(`export const run = () => x;`, {
          setupCode: `let a = 1; let b = 2; export { a as x, b as _a };`,
        }),
      ).toBe(1);
    });

    it("should keep writes through setup aliases attached to one mutable binding", async () => {
      expect(
        await executeBundledRun(
          `
            export const run = () => {
              answer++;
              ({ alternate } = { alternate: 10 });
              value += 2;
              return [answer, alternate, value, readValue(), { answer }];
            };
          `,
          {
            setupCode: `
              export let value = 7;
              export { value as answer, value as "alternate" };
              export const readValue = () => value;
            `,
          },
        ),
      ).toEqual([12, 12, 12, 12, { answer: 12 }]);
    });

    it("should let implementation declarations shadow aliases without changing setup references", async () => {
      expect(
        await executeBundledRun(
          `const answer = 10; export const run = () => [answer, readValue()];`,
          {
            setupCode: `
              const value = 7;
              export { value as answer };
              export const readValue = () => value;
            `,
          },
        ),
      ).toEqual([10, 7]);
    });

    it("should not expose the local name of an aliased-only setup export", async () => {
      expect(
        await executeBundledRun(`export const run = () => typeof value;`, {
          setupCode: `const value = 7; export { value as answer };`,
        }),
      ).toBe("undefined");
    });

    it("should preserve nested implementation bindings when resolving setup aliases", async () => {
      expect(
        await executeBundledRun(
          `
            const readLocal = (answer: number) => answer;
            export const run = (_value = 2) => [answer, readLocal(3), _value];
          `,
          { setupCode: `const value = 7; export { value as answer };` },
        ),
      ).toEqual([7, 3, 2]);
    });

    it("should initialize mutable setup aliases once in each implementation instance", async () => {
      const setupCode = `
        let calls = 0;
        const initialize = () => ++calls;
        export const initial = initialize();
        export { calls as count };
      `;
      const implementationCode = `
        const beforeRun = count;
        export const run = () => [initial, beforeRun, ++count];
      `;

      expect(await executeBundledRun(implementationCode, { setupCode })).toEqual([1, 1, 2]);
      expect(await executeBundledRun(implementationCode, { setupCode })).toEqual([1, 1, 2]);
    });

    it("should hoist setup declarations above the run function", async () => {
      const body = await bundleRunBody(`export const run = () => data.length;`, `export const data = [1, 2, 3];`);

      expect(body).toBe("var data = [1, 2, 3];\nfunction run() {\n  return data.length;\n}");
    });

    it("should let implementation declarations shadow setup exports", async () => {
      expect(
        await executeBundledRun(
          `
            const sum = (a: number, b: number) => a * 10 + b;
            export const run = () => data.reduce(sum, 0);
          `,
          {
            setupCode: `
              export const data = [1, 2, 3, 4];
              export const sum = (a: number, b: number) => a + b;
            `,
          },
        ),
      ).toBe(1234);
    });

    it("should hide setup declarations that are not exported", async () => {
      expect(
        await executeBundledRun(`export const run = () => typeof secret;`, {
          setupCode: `
            const secret = 1;
            export const data = [secret];
          `,
        }),
      ).toBe("undefined");
    });

    it("should let an implementation declare a setup export ambiently", async () => {
      expect(
        await executeBundledRun(`declare const data: number[]; export const run = () => data[0];`, {
          setupCode: `export const data = [8];`,
        }),
      ).toBe(8);
    });
  });
});
