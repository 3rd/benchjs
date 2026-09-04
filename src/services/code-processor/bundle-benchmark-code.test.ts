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

const executeBundledRun = async (userCode: string, ...args: unknown[]) => {
  const bundle = await bundleBenchmarkCode(userCode, "");
  const module: unknown = await import(
    `data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`
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
  beforeAll(() => {
    vi.stubGlobal("location", new URL("https://benchjs.test"));
  });

  afterAll(() => {
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
          5,
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
          5,
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
    it("should hoist setup declarations above the run function", async () => {
      const body = await bundleRunBody(`export const run = () => data.length;`, `const data = [1, 2, 3];`);

      expect(body).toBe("var data = [1, 2, 3];\nfunction run() {\n  return data.length;\n}");
    });
  });
});
