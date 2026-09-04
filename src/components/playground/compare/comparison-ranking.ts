import type { BenchmarkRun } from "@/stores/benchmarkStore";

interface ComparisonMember {
  run: BenchmarkRun | undefined;
}

export const isRankingEligible = (members: readonly ComparisonMember[]) => {
  if (members.length < 2) return false;
  return members.every(
    ({ run }) => run?.status === "completed" && run.result?.evidence.status === "complete",
  );
};
