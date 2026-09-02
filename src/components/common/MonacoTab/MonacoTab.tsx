import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TabContextMenu } from "./TabContextMenu";

export type MonacoTab = {
  id: string;
  name: string;
  active: boolean;
};

interface TabProps {
  tab: MonacoTab;
  tabs: MonacoTab[];
  onClose?: (file: MonacoTab) => void;
  onCloseOthers?: (file: MonacoTab) => void;
  onCloseLeft?: (file: MonacoTab) => void;
  onCloseRight?: (file: MonacoTab) => void;
  onClick?: (file: MonacoTab) => void;
}

export const MonacoTab = ({
  tab,
  tabs,
  onClose,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
  onClick,
}: TabProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.name,
    transition: {
      duration: 150,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
  };

  const handleClick = () => {
    onClick?.(tab);
  };

  const tabContent = (
    <div className="flex gap-2 items-center py-2 px-3 h-[34px]">
      <span className="text-sm truncate">{tab.name}</span>
      <Button
        className={cn("p-0 w-4 h-4 opacity-0 group-hover:opacity-100 ml-auto", tab.active && "opacity-100")}
        size="sm"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onClose?.(tab);
        }}
      >
        <XIcon className="w-3 h-3" />
      </Button>
    </div>
  );

  return (
    <TabContextMenu
      tab={tab}
      tabs={tabs}
      onClose={onClose ?? (() => {})}
      onCloseLeft={onCloseLeft ?? (() => {})}
      onCloseOthers={onCloseOthers ?? (() => {})}
      onCloseRight={onCloseRight ?? (() => {})}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "group relative border-r border-border cursor-pointer min-w-[120px]",
          tab.active ? "bg-background" : "bg-muted hover:bg-accent",
          tab.active &&
            "before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-brand",
        )}
        style={style}
        onClick={handleClick}
        {...attributes}
        {...listeners}
      >
        {tabContent}
      </div>
    </TabContextMenu>
  );
};
