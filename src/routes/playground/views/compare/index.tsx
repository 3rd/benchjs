import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Loader2, PlayIcon } from "lucide-react";
import { useBenchmarkStore } from "@/stores/benchmarkStore";
import { getCurrentDocument, Implementation, usePersistentStore } from "@/stores/persistentStore";
import { benchmarkService } from "@/services/benchmark/benchmark-service";
import { ExportModal } from "@/components/ExportModal";
import { ComparisonChart } from "@/components/playground/compare/ComparisonChart/ComparisonChart";
import { ComparisonTable } from "@/components/playground/compare/ComparisonTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ExtendedImplementation extends Implementation {
  selected: boolean;
  id: string;
  filename: string;
  content: string;
}

export const CompareView = () => {
  const [implementations, setImplementations] = useState<ExtendedImplementation[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState("");
  const store = useBenchmarkStore();
  const persistentStore = usePersistentStore();
  const currentDocument = getCurrentDocument(persistentStore);

  useEffect(() => {
    setImplementations((prev) =>
      currentDocument.implementations.map((item) => ({
        ...item,
        selected: prev.some((curr) => curr.id === item.id),
      })),
    );
  }, [currentDocument.implementations]);

  const handleSelectAll = (checked: boolean) => {
    setImplementations(implementations.map((item) => ({ ...item, selected: checked })));
  };

  const handleToggleSelect = (id: string) => {
    setImplementations(
      implementations.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)),
    );
  };

  const handleRunSelected = useCallback(() => {
    const selectedItems = implementations.filter((item) => item.selected);
    const itemsToRun = selectedItems.length > 0 ? selectedItems : implementations;
    if (itemsToRun.length === 0) return;

    benchmarkService.runBenchmark(currentDocument.setupCode, itemsToRun);
  }, [currentDocument.setupCode, implementations]);

  const handleStop = useCallback((runId: string) => {
    benchmarkService.stopBenchmark(runId);
  }, []);

  const handleRunSingle = useCallback(
    (item: Implementation) => {
      benchmarkService.runBenchmark(currentDocument.setupCode, [item]);
    },
    [currentDocument.setupCode],
  );

  const handleExportResults = () => {
    const resultsData = implementations
      .filter((impl) => {
        const run = store.runs[impl.id]?.at(-1);
        return run?.result;
      })
      .map((impl) => {
        const run = store.runs[impl.id]?.at(-1);
        return {
          name: impl.filename,
          totalTime: run?.elapsedTime,
          opsPerSec: run?.result?.stats.operationsPerSecond.average,
        };
      });

    setExportData(JSON.stringify(resultsData, null, 2));
    setShowExportModal(true);
  };

  const isRunning = implementations.some((item) => {
    const run = store.runs[item.id]?.at(-1);
    return run?.status === "running" || run?.status === "warmup";
  });

  const hasResults = implementations.some((item) => {
    const run = store.runs[item.id]?.at(-1);
    return Boolean(run?.result);
  });

  return (
    <div className="container py-8 px-4 mx-auto">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Compare Performance</h1>

      <AnimatePresence>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Implementations</span>
                <div className="flex items-center space-x-2">
                  {/* export */}
                  <Button disabled={!hasResults} variant="outline" onClick={handleExportResults}>
                    <Download className="w-4 h-4" />
                    Export Results
                  </Button>

                  {/* run */}
                  <Button disabled={isRunning} onClick={handleRunSelected}>
                    {isRunning ?
                      <Loader2 className="w-4 h-4 animate-spin" />
                    : <PlayIcon className="w-4 h-4" />}
                    {/* eslint-disable-next-line no-nested-ternary */}
                    {isRunning ?
                      "Running..."
                    : implementations.some((item) => item.selected) ?
                      "Run Selected"
                    : "Run All"}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* table */}
              <ComparisonTable
                implementations={implementations}
                isRunning={isRunning}
                runs={store.runs}
                onRunSingle={handleRunSingle}
                onSelectAll={handleSelectAll}
                onStop={handleStop}
                onToggleSelect={handleToggleSelect}
              />
            </CardContent>
          </Card>

          {/* charts */}
          <Card>
            <CardHeader>
              <CardTitle className="py-2">Performance Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ComparisonChart implementations={implementations} runs={store.runs} />
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <ExportModal open={showExportModal} value={exportData} onOpenChange={setShowExportModal} />
    </div>
  );
};
