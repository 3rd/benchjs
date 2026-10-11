import { bundleBenchmarkCode } from "@/services/code-processor/bundle-benchmark-code";
import { README_CONTENT } from "./constants";

type BenchmarkModule = { default: () => unknown };

const extractTypeScriptBlocks = (markdown: string) =>
  [...markdown.matchAll(/```typescript\n([\s\S]*?)```/g)].map((match) => match[1]);

const isBenchmarkModule = (value: unknown): value is BenchmarkModule =>
  typeof value === "object" &&
  value !== null &&
  "default" in value &&
  typeof value.default === "function";

describe("README_CONTENT", () => {
  beforeAll(() => {
    vi.stubGlobal("location", new URL("https://benchjs.test"));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("should run the guide's implementation example against its setup example", async () => {
    const [setupCode, implementationCode] = extractTypeScriptBlocks(README_CONTENT);
    const bundle = await bundleBenchmarkCode(implementationCode, setupCode);

    const module: unknown = await import(
      `data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`
    );
    assert(isBenchmarkModule(module), "Expected the benchmark bundle to export a default function");

    expect(module.default()).toBe(499500);
  });
});
