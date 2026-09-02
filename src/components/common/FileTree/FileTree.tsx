import { useState } from "react";
import { ChevronRight, FileIcon, FolderClosed, FolderOpen, MoreVerticalIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export interface FileTreeItem {
  id: string;
  name: string;
  type: "file" | "folder" | "root";
  children?: FileTreeItem[];
  count?: number;
  actions?: {
    onRename?: (newName: string) => void;
    onCreate?: () => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
  };
}

interface FileTreeProps {
  item: FileTreeItem;
  level: number;
  onFileClick?: (item: FileTreeItem) => void;
  activeFileId?: string;
}

const sortItems = (a: FileTreeItem, b: FileTreeItem): number => {
  if (a.type !== b.type) {
    return a.type === "folder" ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
};

const stopPropagation = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

export const FileTree = ({ item, level = 0, onFileClick, activeFileId }: FileTreeProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const isRoot = item.type === "root";
  const isActive = activeFileId === item.id;

  const handleRename = (value: string) => {
    const trimmedName = value.trim();
    if (!trimmedName) {
      setRenameError("Name cannot be empty");
      return;
    }

    try {
      item.actions?.onRename?.(trimmedName);
      setEditingName(false);
      setRenameError(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Failed to rename");
    }
  };

  // file
  if (item.type === "file") {
    return (
      <div
        className={cn(
          "flex items-center h-6 px-2 hover:bg-accent cursor-pointer rounded group relative",
          isActive && "bg-accent",
        )}
        style={{ paddingLeft: `${(level + 1) * 10}px` }}
        onContextMenu={(e) => {
          if (item.actions?.onRename ?? item.actions?.onDelete) {
            e.preventDefault();
            setIsMenuOpen(true);
          }
        }}
      >
        {/* icon */}
        <FileIcon
          className={cn(
            "mr-1.5 ml-0.5 w-3.5 h-3.5 shrink-0 text-muted-foreground",
            isActive && "text-foreground",
          )}
        />

        {/* editing mode */}
        {
          editingName ?
            <div className="flex-1">
              <Input
                className={cn(
                  "py-0 w-40 h-6 text-sm",
                  renameError && "border-destructive focus-visible:ring-destructive",
                )}
                value={newName}
                autoFocus
                onBlur={() => {
                  if (!renameError) {
                    setEditingName(false);
                    setNewName(item.name);
                  }
                }}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setRenameError(null);
                }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename(newName);
                  }
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNewName(item.name);
                    setRenameError(null);
                  }
                }}
              />
            </div>
            // render mode
          : <div
              className="flex justify-between items-center w-full"
              role="button"
              onClick={() => onFileClick?.(item)}
            >
              {/* name */}
              <span
                className={cn("truncate flex-1 text-sm text-left", isActive && "font-medium")}
              >
                {item.name}
              </span>

              {/* menu */}
              {(item.actions?.onRename ?? item.actions?.onDelete) && (
                <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                  <DropdownMenuTrigger asChild onClick={stopPropagation}>
                    <div className="invisible ml-2 group-hover:visible">
                      <Button
                        className="w-6 h-6"
                        size="icon"
                        title="More options"
                        variant="ghost"
                        onClick={stopPropagation}
                      >
                        <MoreVerticalIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {item.actions?.onDuplicate && (
                      <DropdownMenuItem
                        onClick={(event) => {
                          stopPropagation(event);
                          item.actions?.onDuplicate?.();
                          setIsMenuOpen(false);
                        }}
                      >
                        Duplicate
                      </DropdownMenuItem>
                    )}
                    {item.actions?.onRename && (
                      <DropdownMenuItem
                        onClick={(event) => {
                          stopPropagation(event);
                          setEditingName(true);
                          setNewName(item.name);
                          setIsMenuOpen(false);
                        }}
                      >
                        Rename
                      </DropdownMenuItem>
                    )}
                    {item.actions?.onDelete && (
                      <DropdownMenuItem
                        onClick={(event) => {
                          stopPropagation(event);
                          item.actions?.onDelete?.();
                          setIsMenuOpen(false);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

        }
      </div>
    );
  }

  // directory or root
  return (
    <div>
      {/* directory */}
      {!isRoot && (
        <div
          className={cn("flex items-center h-6 px-2 hover:bg-accent cursor-pointer rounded group relative")}
          style={{ paddingLeft: `${level * 10}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {/* icon */}
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} />
          {isOpen ?
            <FolderOpen className="mr-1.5 w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <FolderClosed className="mr-1.5 w-3.5 h-3.5 text-muted-foreground shrink-0" />}

          {/* name */}
          <span className="flex-1 text-sm truncate">{item.name}</span>

          {/* create file button */}
          {item.actions?.onCreate && (
            <div className="invisible ml-2 group-hover:visible">
              <Button
                className="w-6 h-6"
                size="icon"
                title="Create new implementation"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  item.actions?.onCreate?.();
                }}
              >
                <PlusIcon className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* count badge */}
          {item.count && (
            <span className="py-px px-1 ml-1.5 text-xs rounded-sm bg-accent text-muted-foreground">
              {item.count}
            </span>
          )}
        </div>
      )}

      {/* children */}
      {(isRoot || (isOpen && item.children)) && (
        <div>
          {item.children
            ?.slice()
            .sort(sortItems)
            .map((child) => (
              <FileTree
                key={child.id}
                activeFileId={activeFileId}
                item={child}
                level={isRoot ? level : level + 1}
                onFileClick={onFileClick}
              />
            ))}
        </div>
      )}
    </div>
  );
};
