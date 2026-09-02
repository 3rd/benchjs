import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const SidebarIcon = ({
  icon: Icon,
  isActive,
  tooltip,
  count,
  onClick,
}: {
  icon: React.ElementType;
  isActive: boolean;
  tooltip: string;
  count?: number;
  onClick?: () => void;
}) => {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={tooltip}
            className={cn(
              "flex relative justify-center items-center w-12 h-12 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
              isActive && "border-l-2 border-brand",
            )}
            type="button"
            onClick={onClick}
          >
            {/* icon */}
            <Icon className={cn("h-5 w-5 text-muted-foreground", isActive && "text-foreground")} />

            {/* badge */}
            {count && (
              <span className="absolute top-1 right-0.5 px-0.5 text-xs rounded-sm bg-accent text-muted-foreground">
                {count}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
