import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "relative z-10 flex w-0 items-center justify-center border-l border-border after:absolute after:inset-y-0 after:-left-px after:border-l-2 after:border-transparent after:transition-colors data-[resize-handle-state=drag]:after:border-muted-foreground data-[resize-handle-state=hover]:after:border-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-0 data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:border-l-0 data-[panel-group-direction=vertical]:border-t data-[panel-group-direction=vertical]:after:-top-px data-[panel-group-direction=vertical]:after:right-0 data-[panel-group-direction=vertical]:after:bottom-auto data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:border-l-0 data-[panel-group-direction=vertical]:after:border-t-2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="flex z-10 justify-center items-center w-3 h-4 rounded-sm border bg-border">
        <GripVertical className="w-2.5 h-2.5" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
