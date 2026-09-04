import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Check, Copy, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
// import { SiFacebook, SiLinkedin, SiX } from "@icons-pack/react-simple-icons";
import type { BenchmarkRun } from "@/stores/benchmarkStore";
import type { Implementation } from "@/stores/persistentStore";
import { CHART_COLORS, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-style";
import { formatCount, formatCountShort, formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ShareDialogProps {
  implementations: Implementation[];
  runs: Record<string, BenchmarkRun[]>;
  shareUrl: string;
  // eslint-disable-next-line react/boolean-prop-naming
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ implementations, runs, shareUrl, open, onOpenChange }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [selectedImplementations, setSelectedImplementations] = useState<string[]>([]);
  const imageRef = useRef<HTMLDivElement>(null);

  const implementationsWithRuns = useMemo(() => {
    return implementations.filter((implementation) => {
      const implementationRuns = runs[implementation.id] || [];
      const latestRun = implementationRuns[implementationRuns.length - 1];
      return Boolean(latestRun?.result?.stats);
    });
  }, [implementations, runs]);

  const chartData = useMemo(() => {
    return implementations
      .filter((item) => selectedImplementations.includes(item.id))
      .map((item) => {
        const implRuns = runs[item.id] || [];
        const latestRun = implRuns[implRuns.length - 1];
        const opsPerSecond = latestRun?.result?.stats?.operationsPerSecond?.average || 0;
        return {
          name: item.filename,
          "Operations/sec": Number(opsPerSecond.toFixed(2)),
        };
      })
      .filter((d) => d["Operations/sec"] > 0);
  }, [implementations, runs, selectedImplementations]);

  const tableData = useMemo(() => {
    return implementations
      .filter((item) => selectedImplementations.includes(item.id))
      .map((item) => {
        const implRuns = runs[item.id] || [];
        const latestRun = implRuns[implRuns.length - 1];
        const stats = latestRun?.result?.stats;
        return {
          name: item.filename,
          opsPerSecond: stats?.operationsPerSecond?.average || 0,
          averageTime: stats?.timePerOperationMs?.average || 0,
          p95: stats?.timePerOperationMs?.percentile95 || 0,
        };
      })
      .filter((d) => d.opsPerSecond > 0);
  }, [implementations, runs, selectedImplementations]);

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleCopyImage = async () => {
    if (!imageRef.current) return;
    try {
      const dataUrl = await toPng(imageRef.current, {
        style: { overflow: "visible" },
        fontEmbedCSS: "",
      });
      const data = await fetch(dataUrl);
      const blob = await data.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch (error) {
      console.error("Failed to copy image:", error);
    }
  };

  const handleDownloadImage = async () => {
    if (!imageRef.current) return;
    try {
      const dataUrl = await toPng(imageRef.current, {
        style: { overflow: "visible" },
        fontEmbedCSS: "",
      });
      const link = document.createElement("a");
      link.download = "benchmark-comparison.png";
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  const handleToggleImplementation = (implementationId: string) => {
    setSelectedImplementations((prev) => {
      const hasItem = prev.includes(implementationId);
      if (hasItem) return prev.filter((item) => item !== implementationId);
      return [...prev, implementationId];
    });
  };

  useEffect(() => {
    if (!open) return;
    setSelectedImplementations(implementationsWithRuns.map((item) => item.id));
  }, [implementationsWithRuns, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Share Benchmark</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Share Link</div>
            <div className="flex items-center space-x-2">
              <Input className="flex-1" value={shareUrl} readOnly />
              <Button className="shrink-0" variant="outline" onClick={handleCopyToClipboard}>
                {copied ?
                  <Check className="w-4 h-4" />
                : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>
          </div>

          {implementations.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Share Image</div>

              <div className="flex gap-4">
                {/* image */}
                {chartData.length > 0 && (
                  <div className="flex-1 space-y-4">
                    <div ref={imageRef} className="p-2 bg-white rounded-lg border dark:bg-zinc-900">
                      {/* chart */}
                      <ResponsiveContainer className="mx-auto" height={150} width={490}>
                        <BarChart data={chartData} margin={{ top: 16, right: 10, left: 20, bottom: 0 }}>
                          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            axisLine={{ stroke: CHART_COLORS.grid }}
                            dataKey="name"
                            height={30}
                            interval={0}
                            textAnchor="end"
                            tick={{ ...chartAxisTick, fontSize: 12 }}
                            tickLine={false}
                          />
                          <YAxis
                            axisLine={false}
                            label={{
                              value: "Ops/sec",
                              angle: -90,
                              position: "left",
                              style: { textAnchor: "middle", fill: CHART_COLORS.label },
                            }}
                            tick={chartAxisTick}
                            tickFormatter={formatCountShort}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
                            formatter={(value) => `${formatCount(Number(value))} ops/sec`}
                            labelStyle={chartTooltipLabelStyle}
                          />
                          <Bar
                            dataKey="Operations/sec"
                            fill={CHART_COLORS.time}
                            isAnimationActive={false}
                            maxBarSize={72}
                            radius={[4, 4, 0, 0]}
                          >
                            <LabelList
                              dataKey="Operations/sec"
                              fill={CHART_COLORS.label}
                              fontSize={11}
                              formatter={(value) => formatCountShort(Number(value))}
                              position="top"
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      {/* table */}
                      <div className="p-2 text-sm deep-overflow-visible">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">Implementation</TableHead>
                              <TableHead className="text-right">Ops/sec</TableHead>
                              <TableHead className="text-right">Avg Time</TableHead>
                              <TableHead className="text-right">P95</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableData.map((item) => (
                              <TableRow key={item.name}>
                                <TableCell className="py-2 font-medium">{item.name}</TableCell>
                                <TableCell className="py-2 text-right">
                                  {formatCount(item.opsPerSecond)}
                                </TableCell>
                                <TableCell className="py-2 text-right">
                                  {formatDuration(item.averageTime)}
                                </TableCell>
                                <TableCell className="py-2 text-right">{item.p95.toFixed(2)}ms</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}

                {/* implementations */}
                <div
                  className={cn(
                    "flex flex-col gap-2 p-2 text-sm rounded-lg border",
                    chartData.length === 0 && "flex-1",
                  )}
                >
                  {implementations.map((item) => {
                    const implRuns = runs[item.id] || [];
                    const latestRun = implRuns[implRuns.length - 1];
                    const hasCompletedRun = Boolean(latestRun?.result?.stats);
                    return (
                      <div key={item.id} className="flex items-center space-x-2">
                        <Checkbox
                          checked={selectedImplementations.includes(item.id)}
                          disabled={!hasCompletedRun}
                          id={item.id}
                          onCheckedChange={() => handleToggleImplementation(item.id)}
                        />
                        <label className={`${!hasCompletedRun && "text-muted-foreground"}`} htmlFor={item.id}>
                          {item.filename}
                          {!hasCompletedRun && " (no run)"}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* actions */}
              {chartData.length > 0 && (
                <div className="flex gap-4 justify-between pt-2">
                  <div className="flex gap-2 items-center">
                    <Button className="gap-2" variant="outline" onClick={handleCopyImage}>
                      <Copy className="w-4 h-4" />
                      {copiedImage ? "Copied!" : "Copy Image"}
                    </Button>
                    <Button className="gap-2" variant="outline" onClick={handleDownloadImage}>
                      <Download className="w-4 h-4" />
                      Download Image
                    </Button>
                  </div>
                  {/* <div className="flex gap-4 items-center"> */}
                  {/*   <Button variant="outline" >  */}
                  {/*     <SiX className="w-4 h-4" /> */}
                  {/*   </Button> */}
                  {/*   <Button variant="outline"> */}
                  {/*     <SiFacebook className="w-4 h-4" /> */}
                  {/*   </Button> */}
                  {/*   <Button variant="outline"> */}
                  {/*     <SiLinkedin className="w-4 h-4" /> */}
                  {/*   </Button> */}
                  {/* </div> */}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
