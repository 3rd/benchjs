import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import type { BenchmarkRun } from "@/stores/benchmarkStore";
import { isRankingEligible } from "./comparison-ranking";

const createRun = (
  id: string,
  status: BenchmarkRun["status"],
  evidenceStatus: NonNullable<BenchmarkRun["result"]>["evidence"]["status"] = "complete",
): BenchmarkRun => {
  const result = createBenchmarkResult(id);
  return {
    id: `run-${id}`,
    implementationId: id,
    createdAt: 100,
    warmupStartedAt: 110,
    warmupEndedAt: 120,
    status,
    filename: `${id}.ts`,
    originalCode: "export const run = () => 1;",
    processedCode: "export default () => 1;",
    progress: status === "completed" ? 100 : null,
    elapsedTime: 1000,
    measurementOperations: 1000,
    measurementElapsedMs: 1000,
    error: null,
    result:
      status === "completed" ?
        {
          ...result,
          evidence: { ...result.evidence, status: evidenceStatus },
        }
      : null,
  };
};

const createMember = (run: BenchmarkRun | undefined) => ({ run });

describe("comparison ranking eligibility", () => {
  const completeRun = createRun("complete", "completed");
  const ineligibleMembers: [string, BenchmarkRun | undefined][] = [
    ["missing", undefined],
    ["running", createRun("running", "running")],
    ["failed", createRun("failed", "failed")],
    ["cancelled", createRun("cancelled", "cancelled")],
    ["inconclusive", createRun("inconclusive", "completed", "dependence-unresolved")],
  ];

  it.each(ineligibleMembers)("does not rank when one comparison member is %s", (_, ineligibleRun) => {
    expect(isRankingEligible([createMember(completeRun), createMember(ineligibleRun)])).toBe(false);
  });

  it("does not rank a single comparison member", () => {
    expect(isRankingEligible([createMember(completeRun)])).toBe(false);
  });

  it("ranks only when every comparison member has complete evidence", () => {
    expect(
      isRankingEligible([
        createMember(createRun("first", "completed")),
        createMember(createRun("second", "completed")),
      ]),
    ).toBe(true);
  });
});
