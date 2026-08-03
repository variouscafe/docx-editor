import type { DocxOptions } from "@shared/options";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AnnotationModeSelectorProps {
  options: DocxOptions;
  onOptionsChange: (options: DocxOptions) => void;
}

export default function AnnotationModeSelector({
  options,
  onOptionsChange,
}: AnnotationModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
        꼬마글씨
      </span>
      <Select
        value={String(options.annotationMode)}
        onValueChange={(v) =>
          onOptionsChange({
            ...options,
            annotationMode: Number(v) as 1 | 2,
          })
        }
      >
        <SelectTrigger className="h-7 gap-1 px-2 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">꼬마글씨1 (인라인)</SelectItem>
          <SelectItem value="2">꼬마글씨2 (단락)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
