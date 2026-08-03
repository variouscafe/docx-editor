import type { DocxOptions } from "@shared/options";
import {
  LineStartSymbol,
  ALL_SYMBOLS,
  getSymbolDisplay,
} from "@shared/lineStartSymbol";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HeadingSymbolSelectorProps {
  options: DocxOptions;
  onOptionsChange: (options: DocxOptions) => void;
}

const HEADING_KEYS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const HEADING_LABELS: Record<string, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  h4: "H4",
  h5: "H5",
  h6: "H6",
};

export default function HeadingSymbolSelector({
  options,
  onOptionsChange,
}: HeadingSymbolSelectorProps) {
  /** 이미 다른 헤딩에 선택된 기호 집합 */
  const getUsedSymbols = (excludeKey: string): Set<LineStartSymbol> => {
    const used = new Set<LineStartSymbol>();
    for (const key of HEADING_KEYS) {
      if (key !== excludeKey) {
        used.add(options[key].lineStartSymbol);
      }
    }
    return used;
  };

  const handleChange = (
    headingKey: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
    newSymbol: LineStartSymbol,
  ) => {
    onOptionsChange({
      ...options,
      [headingKey]: {
        ...options[headingKey],
        lineStartSymbol: newSymbol,
      },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
      <span className="mr-1 text-xs font-medium text-muted-foreground">시작기호</span>
      {HEADING_KEYS.map((key) => {
        const usedSymbols = getUsedSymbols(key);
        const currentSymbol = options[key].lineStartSymbol;

        return (
          <div key={key} className="flex items-center gap-1">
            <span className="text-xs font-semibold">{HEADING_LABELS[key]}:</span>
            <Select
              value={currentSymbol}
              onValueChange={(v) => handleChange(key, v as LineStartSymbol)}
            >
              <SelectTrigger className="h-7 min-w-[68px] gap-1 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_SYMBOLS.map((symbol) => (
                  <SelectItem
                    key={symbol}
                    value={symbol}
                    disabled={usedSymbols.has(symbol)}
                  >
                    {getSymbolDisplay(symbol)}
                    {usedSymbols.has(symbol) ? " (사용 중)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
