import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocxExporterProps {
  /** 내보내기 전 보고서 저장(BE 가 저장된 JSON+템플릿으로 생성). */
  onExport: () => void;
  disabled?: boolean;
}

export default function DocxExporter({ onExport, disabled }: DocxExporterProps) {
  return (
    <Button variant="default" size="sm" onClick={onExport} disabled={disabled} className="shrink-0">
      <Download />
      <span className="hidden sm:inline">내보내기</span>
    </Button>
  );
}
