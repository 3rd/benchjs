import { bundleBenchmarkCode } from "./bundle-benchmark-code";

const BLACKHOLE_PREAMBLE = /^var __benchmateBlackhole = globalThis\.__benchmateBlackhole \?\? \(\((\w+)\) => \1\);$/;
const DEFAULT_EXPORT_FOOTER = "export {\n  run as default\n};";

// every bundle carries the same entry banner, blackhole preamble, and default export of
// `run`; asserting them here keeps each test focused on the transformed module body while
// still failing if the module contract the worker depends on breaks
const bundleRunBody = async (userCode: string, setupCode = "") => {
  const bundle = await bundleBenchmarkCode(userCode, setupCode);
  const lines = bundle.trimEnd().split("\n");

  expect(lines[0], bundle).toMatch(/^\/\/ /);
  expect(lines[1], bundle).toMatch(BLACKHOLE_PREAMBLE);

  const body = lines.slice(2).join("\n");
  expect(body, bundle).toContain(DEFAULT_EXPORT_FOOTER);

  return body.slice(0, body.indexOf(DEFAULT_EXPORT_FOOTER)).trim();
};

const SYNC_RUN = "function run() {\n  return 42;\n}";
const ASYNC_RUN = "async function run() {\n  return 42;\n}";

describe("bundleBenchmarkCode", () => {
  beforeAll(() => {
    vi.stubGlobal("location", new URL("https://benchjs.test"));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
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
      ["async named run function declaration export", `export async function run() { return 42; }`, ASYNC_RUN],
      ["default export arrow function", `export default () => { return 42; }`, SYNC_RUN],
      ["default export arrow function with implicit return", `export default () => 42`, SYNC_RUN],
      ["async default export arrow function", `export default async () => { return 42; }`, ASYNC_RUN],
      ["default export function expression", `export default function() { return 42; }`, SYNC_RUN],
      ["async default export function expression", `export default async function() { return 42; }`, ASYNC_RUN],
      ["default export named function expression", `export default function test() { return 42; }`, SYNC_RUN],
      [
        "async default export named function expression",
        `export default async function test() { return 42; }`,
        ASYNC_RUN,
      ],
    ])("should normalize %s to a run function declaration", async (_name, code, expected) => {
      expect(await bundleRunBody(code)).toBe(expected);
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
