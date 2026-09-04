import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BenchmarkRun } from "@/stores/benchmarkStore";
import { RunTab } from "./RunTab";

const createRun = (
  status: BenchmarkRun["status"],
  result: BenchmarkRun["result"] = null,
  error: string | null = null,
) =>
  ({
    id: "run-1",
    implementationId: "impl-1",
    createdAt: 100,
    warmupStartedAt: 110,
    warmupEndedAt: 120,
    status,
    filename: "test.js",
    originalCode: "export const run = () => 1;",
    processedCode: "export const run = () => 1;",
    progress: 100,
    elapsedTime: 1000,
    measurementOperations: 1000,
    measurementElapsedMs: 1000,
    error,
    result,
  }) satisfies BenchmarkRun;

type Observation = NonNullable<BenchmarkRun["result"]>["evidence"]["observations"][number];

const createObservation = (sequence: number, flags: Observation["flags"]): Observation => ({
  sequence,
  task: "test",
  phase: "measurement",
  startedAtMs: sequence,
  elapsedMs: 1,
  operations: 1000,
  round: null,
  seed: null,
  resultHash: null,
  flags,
});

const renderRunTab = (latestRun?: BenchmarkRun) =>
  renderToStaticMarkup(
    <RunTab
      chartData={[]}
      clearChartData={() => {}}
      isRunning={latestRun?.status === "running" || latestRun?.status === "warmup"}
      latestRun={latestRun}
    />,
  );

describe("RunTab", () => {
  it("shows a failed run error without the never-run state", () => {
    const output = renderRunTab(createRun("failed", null, "boom"));

    expect(output).toContain("Error: boom");
    expect(output).not.toContain("No benchmark runs yet");
  });

  it("shows a cancelled run state without the never-run state", () => {
    const output = renderRunTab(createRun("cancelled"));

    expect(output).toMatch(/cancelled/i);
    expect(output).not.toContain("No benchmark runs yet");
  });

  it("shows the never-run state when no run exists", () => {
    const output = renderRunTab();

    expect(output).toContain("No benchmark runs yet");
  });

  it("keeps warmup progress indeterminate", () => {
    const output = renderRunTab({ ...createRun("warmup"), progress: null });

    expect(output).toContain('role="progressbar"');
    expect(output).not.toContain("aria-valuenow");
  });

  it("keeps completed results in the statistics panel", () => {
    const output = renderRunTab(createRun("completed", createBenchmarkResult("test")));

    expect(output).toContain("Run details");
    expect(output).not.toContain("No benchmark runs yet");
  });

  it("counts per-block flags but reports a series-wide flag once", () => {
    const output = renderRunTab(
      createRun(
        "completed",
        createBenchmarkResult("test", {
          observations: [
            createObservation(1, ["drift-detected", "pause-like"]),
            createObservation(2, ["drift-detected", "pause-like"]),
            createObservation(3, ["drift-detected"]),
          ],
        }),
      ),
    );

    expect(output).toContain("pause-like ×2");
    expect(output).toContain("drift-detected");
    expect(output).not.toContain("drift-detected ×");
  });
});
