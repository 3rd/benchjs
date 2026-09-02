import { useState } from "react";
import { Check, ChevronsUpDown, FilePlus2, Trash2 } from "lucide-react";
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

  const handleDelete = () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }

    setIsConfirmingDelete(false);
    onDelete(currentDocumentId);
  };

  return (
    <div className="flex gap-1 items-center">
      <input
        aria-label="Document title"
        className="w-56 h-8 text-sm text-center bg-transparent border-b border-transparent outline-none hover:border-border focus:border-primary"
        placeholder={DEFAULT_DOCUMENT_TITLE}
        type="text"
        value={currentTitle}
        onChange={(event) => onRename(event.target.value)}
      />
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Open documents" size="icon" variant="ghost">
                  <ChevronsUpDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Open documents</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Documents</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {documents.map((document) => (
            <DropdownMenuItem
              key={document.id}
              className="justify-between"
              onSelect={() => {
                setIsConfirmingDelete(false);
                onSelect(document.id);
              }}
            >
              <span className="truncate">{document.title || DEFAULT_DOCUMENT_TITLE}</span>
              <Check className={cn("w-4 h-4", document.id !== currentDocumentId && "invisible")} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        aria-label="Create document"
        size="icon"
        tooltip="Create document"
        variant="ghost"
        onClick={onCreate}
      >
        <FilePlus2 className="w-4 h-4" />
      </Button>
      <Button
        aria-label={isConfirmingDelete ? "Confirm delete document" : "Delete document"}
        className={cn(isConfirmingDelete && "w-auto px-2 text-xs text-destructive")}
        size="icon"
        tooltip={isConfirmingDelete ? "Confirm delete document" : "Delete document"}
        variant="ghost"
        onClick={handleDelete}
        onMouseLeave={() => setIsConfirmingDelete(false)}
      >
        {isConfirmingDelete ? "Sure?" : <Trash2 className="w-4 h-4" />}
      </Button>
    </div>
  );
};
