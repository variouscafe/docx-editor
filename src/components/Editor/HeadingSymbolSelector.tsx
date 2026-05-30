import type { DocxOptions } from "../../types/options";
import {
  LineStartSymbol,
  ALL_SYMBOLS,
  getSymbolDisplay,
} from "../../types/lineStartSymbol";

interface HeadingSymbolSelectorProps {
  options: DocxOptions;
  onOptionsChange: (options: DocxOptions) => void;
}

const HEADING_KEYS = ["h1", "h2", "h3", "h4"] as const;
const HEADING_LABELS: Record<string, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  h4: "H4",
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
    headingKey: "h1" | "h2" | "h3" | "h4",
    newSymbol: LineStartSymbol
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
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
      <span className="text-xs font-medium text-gray-500 mr-1">시작기호</span>
      {HEADING_KEYS.map((key) => {
        const usedSymbols = getUsedSymbols(key);
        const currentSymbol = options[key].lineStartSymbol;

        return (
          <div key={key} className="flex items-center gap-1">
            <label className="text-xs font-semibold text-gray-600">
              {HEADING_LABELS[key]}:
            </label>
            <select
              className="h-7 px-1.5 text-xs border border-gray-300 rounded bg-white min-w-[48px]"
              value={currentSymbol}
              onChange={(e) =>
                handleChange(key, e.target.value as LineStartSymbol)
              }
            >
              {ALL_SYMBOLS.map((symbol) => (
                <option
                  key={symbol}
                  value={symbol}
                  disabled={usedSymbols.has(symbol)}
                >
                  {getSymbolDisplay(symbol)}
                  {usedSymbols.has(symbol) ? " (사용 중)" : ""}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
