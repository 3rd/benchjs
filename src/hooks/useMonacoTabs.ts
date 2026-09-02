import { useCallback, useEffect, useState } from "react";
import { Implementation } from "@/stores/persistentStore";
import { MonacoTab } from "@/components/common/MonacoTab";

interface UseMonacoTabsOptions {
  documentId?: string;
  initialActiveTabId?: string | null;
  onTabChange?: (tabId: string | null) => void;
  onTabClose?: (tabId: string) => void;
}

const defaultTabsIds = new Set(["README.md", "setup.ts"]);

const createInitialTabs = (implementations: Implementation[], activeTabId?: string | null) => {
  const readmeTab: MonacoTab = {
    id: "README.md",
    name: "README.md",
    active: true,
  };
  if (!activeTabId || activeTabId === readmeTab.id) return [readmeTab];

  if (activeTabId === "setup.ts") {
    return [
      { ...readmeTab, active: false },
      { id: "setup.ts", name: "setup.ts", active: true },
    ];
  }

  const implementation = implementations.find((item) => item.id === activeTabId);
  if (!implementation) return [readmeTab];

  return [
    { ...readmeTab, active: false },
    { id: implementation.id, name: implementation.filename, active: true },
  ];
};

export const useMonacoTabs = (implementations: Implementation[], options?: UseMonacoTabsOptions) => {
  const [tabs, setTabs] = useState<MonacoTab[]>(() => createInitialTabs(implementations, options?.initialActiveTabId));

  const changeTab = useCallback(
    (tab: MonacoTab | string) => {
      const tabId = typeof tab === "string" ? tab : tab.id;
      setTabs((prev) =>
        prev.map((item) => ({
          ...item,
          active: item.id === tabId,
        })),
      );
      options?.onTabChange?.(tabId);
    },
    [options],
  );

  const closeTab = useCallback(
    (tab: MonacoTab) => {
      let nextActiveTabId: string | null = null;
      let hasNoOpenTabs = false;
      setTabs((prev) => {
        const filtered = prev.filter((item) => item.id !== tab.id);
        if (filtered.length === 0) {
          hasNoOpenTabs = true;
        } else if (tab.active) {
          filtered[filtered.length - 1].active = true;
          nextActiveTabId = filtered[filtered.length - 1].id;
        }
        return filtered;
      });

      options?.onTabClose?.(tab.id);

      if (hasNoOpenTabs) {
        const newTab = { id: "README.md", name: "README.md", active: true };
        setTabs((prev) => [...prev.map((item) => ({ ...item, active: false })), newTab]);
        changeTab(newTab);
      } else if (nextActiveTabId) {
        changeTab(nextActiveTabId);
      }
    },
    [changeTab, options],
  );

  const closeOtherTabs = useCallback((targetTab: MonacoTab) => {
    setTabs((prev) => {
      const keptTab = prev.find((tab) => tab.id === targetTab.id);
      if (!keptTab) return prev;
      return [{ ...keptTab, active: true }];
    });
  }, []);

  const closeTabsToLeft = useCallback((targetTab: MonacoTab) => {
    setTabs((prev) => {
      const targetIndex = prev.findIndex((tab) => tab.id === targetTab.id);
      if (targetIndex <= 0) return prev;

      return prev.slice(targetIndex).map((tab) => ({
        ...tab,
        active: tab.id === targetTab.id,
      }));
    });
  }, []);

  const closeTabsToRight = useCallback((targetTab: MonacoTab) => {
    setTabs((prev) => {
      const targetIndex = prev.findIndex((tab) => tab.id === targetTab.id);
      if (targetIndex === -1) return prev;

      return prev.slice(0, targetIndex + 1).map((tab) => ({
        ...tab,
        active: tab.id === targetTab.id,
      }));
    });
  }, []);

  const openTab = useCallback(
    (tab: MonacoTab | string) => {
      if (typeof tab === "string") {
        setTabs((prev) => prev.map((item) => ({ ...item, active: item.id === tab })));
        return;
      }

      const hasTab = tabs.some((item) => item.id === tab.id);
      if (hasTab) {
        setTabs((prev) => {
          return prev.map((item) => ({
            ...item,
            active: typeof tab === "string" ? item.id === tab : item.id === tab.id,
          }));
        });
      } else {
        const newTab = { id: tab.id, name: tab.name, active: true };
        setTabs((prev) => [...prev.map((item) => ({ ...item, active: false })), newTab]);
        changeTab(newTab);
      }
    },
    [changeTab, tabs],
  );

  useEffect(() => {
    const implementationNameMap = implementations.reduce(
      (acc, item) => {
        acc[item.id] = item.filename;
        return acc;
      },
      {} as Record<string, string>,
    );

    setTabs((prev) => {
      // sync names
      const newTabs = prev
        .filter((tab) => defaultTabsIds.has(tab.id) || implementationNameMap[tab.id] !== undefined)
        .map((item) => ({
          ...item,
          name: implementationNameMap[item.id] ?? item.name,
        }));

      // active tab fallback
      if (!newTabs.some((tab) => tab.active)) {
        const readmeTabIndex = newTabs.findIndex((tab) => tab.id === "README.md");
        if (readmeTabIndex !== -1) {
          newTabs[readmeTabIndex] = { ...newTabs[readmeTabIndex], active: true };
        } else if (newTabs.length > 0) {
          newTabs[newTabs.length - 1] = { ...newTabs[newTabs.length - 1], active: true };
        }
      }

      return newTabs;
    });
  }, [implementations]);

  useEffect(() => {
    setTabs(createInitialTabs(implementations, options?.initialActiveTabId));
  }, [options?.documentId]);

  const activeTabId = tabs.find((item) => item.active)?.id ?? null;

  return {
    tabs,
    activeTabId,
    changeTab,
    closeTab,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    openTab,
    setTabs,
  };
};
