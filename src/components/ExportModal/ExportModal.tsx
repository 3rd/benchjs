import { Monaco } from "@/components/common/Monaco";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ExportModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
}

export function ExportModal({ isOpen, onOpenChange, value }: ExportModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Export Results</DialogTitle>
        </DialogHeader>
        <div className="mt-2 rounded border-2 h-[60vh]">
          <Monaco
            language="json"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
            value={value}
          />
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
