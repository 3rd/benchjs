import { renderToStaticMarkup } from "react-dom/server";
import type { BenchmarkRun } from "@/stores/benchmarkStore";
import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import { ComparisonChart } from "./ComparisonChart";

const implementation = {
  id: "implementation-1",
  filename: "example.ts",
  content: "export const run = () => 1;",
};

const renderChart = (result: NonNullable<BenchmarkRun["result"]>) => {
  const run: BenchmarkRun = {
    id: result.name,
    implementationId: implementation.id,
    createdAt: 100,
    warmupStartedAt: null,
    warmupEndedAt: null,
    status: "completed",
    filename: implementation.filename,
    originalCode: implementation.content,
    processedCode: "export default () => 1;",
    progress: 100,
    elapsedTime: 1000,
    measurementOperations: 1000,
    measurementElapsedMs: 1000,
    error: null,
    result,
  };

  return renderToStaticMarkup(
    <ComparisonChart implementations={[implementation]} runs={{ [implementation.id]: [run] }} />,
  );
};

it("identifies the indicative chart estimate and explains its evidence", () => {
  const result = createBenchmarkResult("run-1");
  result.evidence.status = "timer-limited";

  const output = renderChart(result);

  expect(output).toContain("example.ts");
  expect(output).toContain("Indicative estimate");
  expect(output).toContain("timer-limited");
  expect(output).toContain("This browser&#x27;s clock is too coarse for a precise measurement here.");
});

it("explains an unavailable estimate instead of showing the never-run state", () => {
  const result = createBenchmarkResult("run-1", {
    operationsPerSecond: { average: null, min: null, max: null },
  });
  result.evidence.status = "unidentifiable";

  const output = renderChart(result);

  expect(output).toContain("Estimate unavailable");
  expect(output).toContain("No reliable estimate could be produced from this run.");
  expect(output).not.toContain("No results yet");
});
