import { useState } from "react";
import { Check, ChevronDown, FileCode2, FilePlus2, Trash2 } from "lucide-react";
import type { BenchmarkDocument } from "@/stores/persistentStore";
import { DEFAULT_DOCUMENT_TITLE } from "@/stores/persistentStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DocumentSwitcherProps {
  documents: Pick<BenchmarkDocument, "id" | "title">[];
  currentDocumentId: string;
  currentTitle: string;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (title: string) => void;
  onSelect: (id: string) => void;
}

export const DocumentSwitcher = ({
  documents,
  currentDocumentId,
  currentTitle,
  onCreate,
  onDelete,
  onRename,
  onSelect,
}: DocumentSwitcherProps) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleDelete = (event: Event) => {
    if (!isConfirmingDelete) {
      event.preventDefault();
      setIsConfirmingDelete(true);
      return;
    }

    setIsConfirmingDelete(false);
    onDelete(currentDocumentId);
  };

  return (
    <div className="flex items-center h-8 rounded-lg border-2 transition-colors border-border has-[:focus-visible]:border-ring">
      <FileCode2 aria-hidden="true" className="ml-2.5 w-4 h-4 shrink-0 text-muted-foreground" />
      <input
        aria-label="Document title"
        className="px-2 h-full text-sm font-medium bg-transparent outline-none min-w-24 max-w-72 field-sizing-content truncate placeholder:font-normal placeholder:text-muted-foreground"
        placeholder={DEFAULT_DOCUMENT_TITLE}
        type="text"
        value={currentTitle}
        onChange={(event) => onRename(event.target.value)}
      />
      <DropdownMenu
        onOpenChange={(isOpen) => {
          if (isOpen) return;

          setIsConfirmingDelete(false);
        }}
      >
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Open documents"
                  className="w-8 h-full rounded-l-none rounded-r-md border-l-2 border-border text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-accent focus-visible:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                  size="icon"
                  variant="ghost"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Open documents</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="start" className="w-64" sideOffset={6}>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Documents</DropdownMenuLabel>
          {documents.map((document) => {
            const isCurrent = document.id === currentDocumentId;

            return (
              <DropdownMenuItem key={document.id} onSelect={() => onSelect(document.id)}>
                <FileCode2 className="text-muted-foreground" />
                <span className={cn("flex-1 truncate", isCurrent && "font-medium")}>
                  {document.title || DEFAULT_DOCUMENT_TITLE}
                </span>
                <Check className={cn(!isCurrent && "invisible")} />
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onCreate}>
            <FilePlus2 />
            New document
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={handleDelete}
          >
            <Trash2 />
            {isConfirmingDelete ? "Click again to delete" : "Delete document"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
