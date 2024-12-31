import { ReactNode, useState } from "react";
import {
  ChevronsDownIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpIcon,
  Columns2Icon,
  FlameIcon,
  Loader2Icon,
  Rows2Icon,
  SquareChevronRightIcon,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useLatestRunForImplementation } from "@/stores/benchmarkStore";
import { useBenchmarkStore } from "@/stores/benchmarkStore";
import { Implementation } from "@/stores/persistentStore";
import { cn } from "@/lib/utils";
import { RunTab } from "@/components/playground/code/RunPanel/tabs/RunTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsoleTab } from "./tabs/ConsoleTab";

type RunPanelTab = "console" | "run";

interface RunPanelHeaderProps {
  activeTab: RunPanelTab;
  children?: ReactNode;
  isRunning?: boolean;
  layout?: "horizontal" | "vertical";
  collapsed?: boolean;
  onTabChange: (tab: string) => void;
  onLayoutChange?: () => void;
  onToggleCollapse?: () => void;
}

export const RunPanelTabs = ({
  activeTab,
  children,
  isRunning,
  layout,
  collapsed,
  onTabChange,
  onLayoutChange,
  onToggleCollapse,
}: RunPanelHeaderProps) => {
  const isVerticalCollapsed = collapsed && layout === "horizontal";

  return (
    <Tabs
      className={cn("overflow-hidden", !collapsed && "h-full")}
      value={activeTab}
      onValueChange={onTabChange}
    >
      <TabsList
        className={cn(
          "flex overflow-auto justify-start p-0 w-full rounded-none border-b bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800",
          isVerticalCollapsed && "h-full items-start",
        )}
      >
        {!isVerticalCollapsed && (
          <>
            <TabsTrigger
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 px-4 rounded-none border-r dark:border-zinc-800 py-1.5 flex items-center gap-1"
              value="run"
            >
              <FlameIcon className="w-4 h-4" />
              <span>Run</span>
            </TabsTrigger>
            <TabsTrigger
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 px-4 rounded-none border-r dark:border-zinc-800 py-1.5 flex items-center gap-1"
              value="console"
            >
              <SquareChevronRightIcon className="w-4 h-4" />
              <span>Console</span>
            </TabsTrigger>
          </>
        )}

        <div
          className={cn(
            "flex gap-1 items-center ml-auto",
            isVerticalCollapsed && "flex-col flex-col-reverse",
          )}
        >
          {!isVerticalCollapsed && isRunning && (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" />
              <span className="text-xs text-muted-foreground">Running...</span>
            </>
          )}

          {onLayoutChange && (
            <Button className="w-8 h-8" size="icon" variant="ghost" onClick={onLayoutChange}>
              {layout === "horizontal" ?
                <Columns2Icon className="w-4 h-4" />
              : <Rows2Icon className="w-4 h-4" />}
            </Button>
          )}
          <Button className="w-8 h-8" size="icon" variant="ghost" onClick={onToggleCollapse}>
            {collapsed && layout === "horizontal" && <ChevronsLeftIcon />}
            {!collapsed && layout === "horizontal" && <ChevronsRightIcon />}
            {collapsed && layout === "vertical" && <ChevronsUpIcon />}
            {!collapsed && layout === "vertical" && <ChevronsDownIcon />}
          </Button>
        </div>
      </TabsList>
      {children}
    </Tabs>
  );
};

interface RunPanelProps {
  implementation: Implementation;
  onRun?: () => void;
  onStop?: () => void;
  layout?: "horizontal" | "vertical";
  onLayoutChange?: () => void;
  onToggleCollapse?: () => void;
  activeTab?: RunPanelTab;
  onTabChange?: (tab: RunPanelTab) => void;
}

export const RunPanel = ({
  implementation,
  onRun,
  onStop,
  layout,
  onLayoutChange,
  onToggleCollapse,
  activeTab: externalActiveTab,
  onTabChange: externalOnTabChange,
}: RunPanelProps) => {
  const latestRun = useLatestRunForImplementation(implementation.id);
  const chartData = useBenchmarkStore(
    useShallow((state) => (latestRun ? state.chartData[latestRun.id] || [] : [])),
  );
  const { clearChartData } = useBenchmarkStore(
    useShallow((state) => ({
      addChartPoint: state.addChartPoint,
      clearChartData: state.clearChartData,
    })),
  );
  const consoleLogs = useBenchmarkStore((state) => (latestRun ? state.consoleLogs[latestRun.id] : null));

  const [internalActiveTab, setInternalActiveTab] = useState<RunPanelTab>("run");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isRunning = latestRun?.status === "running" || latestRun?.status === "warmup";

  const activeTab = externalActiveTab ?? internalActiveTab;
  const handleSetTab = (tab: string) => {
    const newTab = tab as RunPanelTab;
    if (externalOnTabChange) {
      externalOnTabChange(newTab);
    } else {
      setInternalActiveTab(newTab);
    }
  };

  const handleRun = async () => {
    onRun?.();
  };

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    onToggleCollapse?.();
  };

  return (
    <>
      <RunPanelTabs
        activeTab={activeTab}
        isRunning={isRunning}
        layout={layout}
        onLayoutChange={onLayoutChange}
        onTabChange={handleSetTab}
        onToggleCollapse={handleToggleCollapse}
      >
        <div className="overflow-auto h-full">
          <TabsContent className="m-0" value="run">
            <RunTab
              chartData={chartData}
              clearChartData={clearChartData}
              isRunning={isRunning}
              latestRun={latestRun}
              onRun={handleRun}
              onStop={onStop}
            />
          </TabsContent>

          <TabsContent className="m-0" value="console">
            <ConsoleTab logs={consoleLogs} />
          </TabsContent>
        </div>
      </RunPanelTabs>
    </>
  );
};
