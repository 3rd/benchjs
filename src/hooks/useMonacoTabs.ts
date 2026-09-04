import { useCallback, useEffect, useState } from "react";
import type { Implementation } from "@/stores/persistentStore";
import { BUILT_IN_FILE_IDS, README_FILE_ID, SETUP_FILE_ID } from "@/constants";
import { MonacoTab } from "@/components/common/MonacoTab";

interface UseMonacoTabsOptions {
  documentId?: string;
  initialActiveTabId?: string | null;
  onTabChange?: (tabId: string | null) => void;
  onTabClose?: (tabId: string) => void;
}

const createInitialTabs = (
  implementations: Pick<Implementation, "filename" | "id">[],
  activeTabId?: string | null,
) => {
  const readmeTab: MonacoTab = {
    id: README_FILE_ID,
    name: README_FILE_ID,
    active: true,
  };
  if (!activeTabId || activeTabId === readmeTab.id) return [readmeTab];

  if (activeTabId === SETUP_FILE_ID) {
    return [
      { ...readmeTab, active: false },
      { id: SETUP_FILE_ID, name: SETUP_FILE_ID, active: true },
    ];
  }

  const implementation = implementations.find((item) => item.id === activeTabId);
  if (!implementation) return [readmeTab];

  return [
    { ...readmeTab, active: false },
    { id: implementation.id, name: implementation.filename, active: true },
  ];
};

export const useMonacoTabs = (
  implementations: Pick<Implementation, "filename" | "id">[],
  options?: UseMonacoTabsOptions,
) => {
  const [tabs, setTabs] = useState<MonacoTab[]>(() =>
    createInitialTabs(implementations, options?.initialActiveTabId),
  );
  const [renderedSelection, setRenderedSelection] = useState(() => ({
    documentId: options?.documentId,
    activeTabId: options?.initialActiveTabId,
  }));

  const changeTab = useCallback(
    (tab: MonacoTab | string) => {
      const tabId = typeof tab === "string" ? tab : tab.id;
      setRenderedSelection({
        documentId: options?.documentId,
        activeTabId: tabId,
      });
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
        const newTab = { id: README_FILE_ID, name: README_FILE_ID, active: true };
        setTabs((prev) => [...prev.map((item) => ({ ...item, active: false })), newTab]);
        changeTab(newTab);
      } else if (nextActiveTabId) {
        changeTab(nextActiveTabId);
      }
    },
    [changeTab, options],
  );

  const closeOtherTabs = useCallback(
    (targetTab: MonacoTab) => {
      const keptTab = tabs.find((tab) => tab.id === targetTab.id);
      if (!keptTab) return;

      setTabs([keptTab]);
      changeTab(targetTab);
    },
    [changeTab, tabs],
  );

  const closeTabsToLeft = useCallback(
    (targetTab: MonacoTab) => {
      const targetIndex = tabs.findIndex((tab) => tab.id === targetTab.id);
      if (targetIndex <= 0) return;

      setTabs(tabs.slice(targetIndex));
      changeTab(targetTab);
    },
    [changeTab, tabs],
  );

  const closeTabsToRight = useCallback(
    (targetTab: MonacoTab) => {
      const targetIndex = tabs.findIndex((tab) => tab.id === targetTab.id);
      if (targetIndex === -1) return;

      setTabs(tabs.slice(0, targetIndex + 1));
      changeTab(targetTab);
    },
    [changeTab, tabs],
  );

  const openTab = useCallback(
    (tab: MonacoTab | string) => {
      if (typeof tab === "string") {
        if (tabs.some((item) => item.id === tab)) {
          changeTab(tab);
          return;
        }

        setTabs((prev) => prev.map((item) => ({ ...item, active: item.id === tab })));
        return;
      }

      const hasTab = tabs.some((item) => item.id === tab.id);
      if (hasTab) {
        changeTab(tab);
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
        .filter((tab) => BUILT_IN_FILE_IDS.has(tab.id) || implementationNameMap[tab.id] !== undefined)
        .map((item) => ({
          ...item,
          name: implementationNameMap[item.id] ?? item.name,
        }));

      // active tab fallback
      if (!newTabs.some((tab) => tab.active)) {
        const readmeTabIndex = newTabs.findIndex((tab) => tab.id === README_FILE_ID);
        if (readmeTabIndex !== -1) {
          newTabs[readmeTabIndex] = { ...newTabs[readmeTabIndex], active: true };
        } else if (newTabs.length > 0) {
          newTabs[newTabs.length - 1] = { ...newTabs[newTabs.length - 1], active: true };
        }
      }

      return newTabs;
    });
  }, [implementations]);

  if (
    renderedSelection.documentId !== options?.documentId ||
    renderedSelection.activeTabId !== options?.initialActiveTabId
  ) {
    setRenderedSelection({
      documentId: options?.documentId,
      activeTabId: options?.initialActiveTabId,
    });
    setTabs(createInitialTabs(implementations, options?.initialActiveTabId));
  }

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
