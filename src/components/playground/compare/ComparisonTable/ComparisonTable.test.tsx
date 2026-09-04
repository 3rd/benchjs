import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComparisonTable } from "./ComparisonTable";

const implementations = [
  {
    id: "implementation-1",
    filename: "implementation1.ts",
    content: "export const run = () => 1;",
    selected: true,
  },
  {
    id: "implementation-2",
    filename: "implementation2.ts",
    content: "export const run = () => 2;",
    selected: false,
  },
];

describe("ComparisonTable", () => {
  it("names the select-all and implementation selectors", () => {
    const output = renderToStaticMarkup(
      <ComparisonTable
        implementations={implementations}
        isRunning={false}
        runs={{}}
        onRunSingle={() => {}}
        onSelectAll={() => {}}
        onStop={() => {}}
        onToggleSelect={() => {}}
      />,
    );

    expect(output).toContain('aria-label="Select all implementations"');
    expect(output).toContain('aria-label="Select implementation1.ts"');
    expect(output).toContain('aria-label="Select implementation2.ts"');
  });
});
