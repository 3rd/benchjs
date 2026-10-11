import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import type { BenchmarkRun } from "@/stores/benchmarkStore";
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

const createRun = (implementationId: string, overrides: Partial<BenchmarkRun> = {}) => ({
  id: `run-${implementationId}`,
  implementationId,
  createdAt: 100,
  warmupStartedAt: 110,
  warmupEndedAt: 120,
  status: "running",
  filename: `${implementationId}.ts`,
  originalCode: "export const run = () => 1;",
  processedCode: "export default () => 1;",
  progress: null,
  elapsedTime: 1000,
  measurementOperations: 0,
  measurementElapsedMs: 0,
  error: null,
  result: null,
  ...overrides,
}) satisfies BenchmarkRun;

const createCompletedRun = (implementationId: string, operationsPerSecond: number) =>
  createRun(implementationId, {
    status: "completed",
    progress: 100,
    result: createBenchmarkResult(`run-${implementationId}`, {
      operationsPerSecond: { average: operationsPerSecond },
    }),
  });

const renderTable = (runs: Record<string, BenchmarkRun[]>, tableImplementations = implementations) =>
  renderToStaticMarkup(
    <ComparisonTable
      implementations={tableImplementations}
      isRunning={false}
      runs={runs}
      onRunSingle={() => {}}
      onSelectAll={() => {}}
      onStop={() => {}}
      onToggleSelect={() => {}}
    />,
  );

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

  it("shows a running figure as provisional, without a deficit", () => {
    const output = renderTable({
      "implementation-1": [createCompletedRun("implementation-1", 2000)],
      "implementation-2": [
        createRun("implementation-2", { measurementOperations: 1000, measurementElapsedMs: 1000 }),
      ],
    });

    expect(output).toContain('<span class="font-medium text-blue-600">1,000</span>');
    expect(output).not.toContain("(-50.0%)");
  });

  it("measures a completed figure's deficit against finished results only", () => {
    const tableImplementations = [
      ...implementations,
      {
        id: "implementation-3",
        filename: "implementation3.ts",
        content: "export const run = () => 3;",
        selected: true,
      },
    ];
    const output = renderTable(
      {
        "implementation-1": [createCompletedRun("implementation-1", 1000)],
        "implementation-2": [createCompletedRun("implementation-2", 2000)],
        "implementation-3": [
          createRun("implementation-3", { measurementOperations: 4000, measurementElapsedMs: 1000 }),
        ],
      },
      tableImplementations,
    );

    expect(output).toContain(
      '<span class="font-medium text-orange-600">1,000</span><span class="text-xs text-muted-foreground">(-50.0%)</span>',
    );
  });

  it("marks the fastest completed figure as best once all runs finish", () => {
    const output = renderTable({
      "implementation-1": [createCompletedRun("implementation-1", 2000)],
      "implementation-2": [createCompletedRun("implementation-2", 1000)],
    });

    expect(output).toContain('<span class="font-semibold text-green-600">2,000</span>');
    expect(output).toContain(">Best</span>");
  });
});
