import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DocumentImportDialogProps {
  open: boolean;
  savedDocumentTitle: string;
  sharedDocumentTitle: string;
  onMakeCopy: () => void;
  onOverwrite: () => void;
}

export const DocumentImportDialog = ({
  open,
  savedDocumentTitle,
  sharedDocumentTitle,
  onMakeCopy,
  onOverwrite,
}: DocumentImportDialogProps) => {
  return (
    <Dialog open={open}>
      <DialogContent
        className="gap-0 overflow-hidden bg-card p-0 shadow-2xl duration-150 sm:max-w-md [&>button]:hidden"
        overlayClassName="bg-black/50 backdrop-blur-[2px] duration-150 dark:bg-black/60"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-3 px-6 py-6 text-left">
          <DialogTitle className="text-xl leading-7">
            This document already exists
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-foreground/80">
            The shared document{" "}
            <span className="font-medium text-foreground">
              &ldquo;{sharedDocumentTitle}&rdquo;
            </span>{" "}
            is different from your saved document{" "}
            <span className="font-medium text-foreground">
              &ldquo;{savedDocumentTitle}&rdquo;
            </span>
            . Replace your saved document or keep both.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 border-t bg-muted/40 px-6 py-4 sm:flex-row sm:space-x-0">
          <Button
            className="w-full sm:w-auto"
            type="button"
            onClick={onMakeCopy}
          >
            Keep both
          </Button>
          <Button
            className="w-full sm:w-auto"
            type="button"
            variant="destructive"
            onClick={onOverwrite}
          >
            Replace saved copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
