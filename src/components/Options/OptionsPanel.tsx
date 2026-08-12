import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Code,
  SlidersHorizontal,
  Copy,
  Braces,
  Type,
  Heading1,
  ListOrdered,
  StickyNote,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DocxOptions } from "@shared/options";
import { LineStartSymbol, ALL_SYMBOLS, getSymbolDisplay } from "@shared/lineStartSymbol";
import { getEffectiveLeadingSpaces } from "@shared/symbols";
import {
  GroupBox,
  NumberField,
  SelectField,
  ToggleField,
  ColorField,
  TextField,
  SpacingFields,
  SegmentedField,
  type SpacingSection,
  FONT_PRESETS,
  matchFontPreset,
} from "./fields";

interface OptionsPanelProps {
  options: DocxOptions;
  onOptionsChange: (options: DocxOptions) => void;
}

const FORCED_LEADING = (s: LineStartSymbol) =>
  s === LineStartSymbol.SQUARE || s === LineStartSymbol.DASH || s === LineStartSymbol.BULLET;

type Category = "common" | "title" | "heading" | "annotation";

const CATEGORIES: { key: Category; label: string; icon: typeof Type }[] = [
  { key: "common", label: "options.category.common", icon: Type },
  { key: "title", label: "options.category.title", icon: Heading1 },
  { key: "heading", label: "options.category.heading", icon: ListOrdered },
  { key: "annotation", label: "options.category.annotation", icon: StickyNote },
];

const HEADING_KEYS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** 헤딩 — 레벨 탭(H1~H6) + 활성 레벨의 시작 기호·스타일·간격. */
function HeadingPanel({
  level,
  onLevel,
  options,
  update,
}: {
  level: number;
  onLevel: (l: number) => void;
  options: DocxOptions;
  update: (key: keyof DocxOptions, patch: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const key = `h${level}` as keyof DocxOptions;
  // h1~h6 union(leadingSpaces 유무 다름) → 런타임 안전 접근
  const heading = options[key] as { lineStartSymbol: LineStartSymbol; leadingSpaces?: number };
  const sym = heading.lineStartSymbol;
  const forced = FORCED_LEADING(sym);
  const effLeading = getEffectiveLeadingSpaces(sym, heading.leadingSpaces ?? 0);
  // 다른 헤딩이 이미 사용 중인 기호 — 중복 선택 방지(CLAUDE.md 규칙).
  const usedSymbols = new Set<LineStartSymbol>();
  for (const k of HEADING_KEYS) {
    if (k !== key) usedSymbols.add(options[k].lineStartSymbol);
  }

  return (
    <>
      {/* 레벨 탭 */}
      <div className="grid grid-cols-6 gap-1 rounded-lg border bg-muted/50 p-1">
        {[1, 2, 3, 4, 5, 6].map((lvl) => {
          const isActive = lvl === level;
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => onLevel(lvl)}
              aria-pressed={isActive}
              className={cn(
                "h-9 rounded text-xs font-semibold transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              H{lvl}
            </button>
          );
        })}
      </div>

      {/* 시작 기호 — 다른 헤딩이 이미 사용 중인 기호는 중복 선택 불가 */}
      <div className="flex items-center justify-between gap-2">
        <Label className="shrink-0 text-xs font-medium text-foreground/80">
          {t("options.field.startSymbol")}
        </Label>
        <Select
          value={sym}
          onValueChange={(v) => update(key, { lineStartSymbol: v as LineStartSymbol })}
        >
          <SelectTrigger className="h-9 max-w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_SYMBOLS.map((symbol) => {
              // NONE(기호 없음)은 여러 헤딩이 동시에 선택 가능.
              const usedByOther = usedSymbols.has(symbol) && symbol !== LineStartSymbol.NONE;
              return (
                <SelectItem key={symbol} value={symbol} disabled={usedByOther}>
                  {symbol === LineStartSymbol.NONE ? t("symbols.none") : getSymbolDisplay(symbol)}
                  {usedByOther ? ` ${t("symbols.inUse")}` : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {level === 1 && (
        <GroupBox label={t("options.group.style")}>
          <NumberField
            label={t("options.field.size")}
            value={options.h1.fontSize}
            onChange={(v) => update("h1", { fontSize: v })}
            unit={t("options.unit.pt")}
            min={6}
            max={72}
          />
          <ToggleField
            label={t("options.field.bold")}
            checked={options.h1.bold}
            onChange={(v) => update("h1", { bold: v })}
          />
        </GroupBox>
      )}

      <GroupBox label={t("options.group.spacing")}>
        <SpacingFields section={`h${level}` as SpacingSection} options={options} update={update} />
      </GroupBox>

      <GroupBox label={t("options.field.leadingSpaces")}>
        <NumberField
          label={t("options.field.count")}
          value={effLeading}
          onChange={(v) => update(key, { leadingSpaces: v })}
          disabled={forced}
          min={0}
          max={12}
        />
        {forced ? (
          <p className="text-[11px] text-muted-foreground">
            {t("options.forcedLeading", { count: effLeading })}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t("options.leadingHint")}</p>
        )}
      </GroupBox>
    </>
  );
}

export default function OptionsPanel({ options, onOptionsChange }: OptionsPanelProps) {
  const { t } = useTranslation();
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(options, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Category>("common");
  const [activeLevel, setActiveLevel] = useState(1);

  const fontOptions = FONT_PRESETS.map((f) => ({ value: f.value, label: t(f.label) }));

  useEffect(() => {
    setJsonText(JSON.stringify(options, null, 2));
    setError(null);
  }, [options]);

  const handleJson = (value: string) => {
    setJsonText(value);
    try {
      onOptionsChange(JSON.parse(value));
      setError(null);
    } catch {
      setError(t("options.invalidJson"));
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success(t("options.jsonCopied"));
    } catch {
      toast.error(t("options.copyFailed"));
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const pretty = JSON.stringify(parsed, null, 2);
      setJsonText(pretty);
      onOptionsChange(parsed);
      setError(null);
    } catch {
      setError(t("options.invalidJson"));
      toast.error(t("options.invalidJsonToast"));
    }
  };

  // 섹션 immutable 업데이트 헬퍼 (key 는 h1~h6/title/common/annotation* 등 객체 섹션)
  const update = (key: keyof DocxOptions, patch: Record<string, unknown>) =>
    onOptionsChange({
      ...options,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key]: { ...(options as any)[key], ...patch },
    } as DocxOptions);

  return (
    <div className="flex h-full flex-col bg-card">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          {t("options.docSettings")}
        </h3>
        <Button
          type="button"
          variant={showJson ? "default" : "ghost"}
          size="sm"
          onClick={() => setShowJson((s) => !s)}
          title={t("options.jsonEdit")}
        >
          <Code className="size-3" />
          {t("options.json")}
        </Button>
      </div>

      {showJson ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* JSON 툴바 */}
          <div className="flex shrink-0 items-center gap-1 border-b bg-muted/30 px-4 py-2">
            <span className="px-1 text-[11px] text-muted-foreground">{t("options.jsonEditing")}</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="xs" onClick={() => void copyJson()} title={t("options.copy")}>
                <Copy /> {t("options.copy")}
              </Button>
              <Button variant="ghost" size="xs" onClick={formatJson} title={t("options.formatAlign")}>
                <Braces /> {t("options.format")}
              </Button>
            </div>
          </div>
          {error && (
            <div className="shrink-0 border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}
          <textarea
            className="flex-1 resize-none p-4 font-mono text-[13px] leading-relaxed outline-none"
            value={jsonText}
            onChange={(e) => handleJson(e.target.value)}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* 좌측 카테고리 메뉴 (모바일: 상단 가로스크롤 탭 / PC: 세로) */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/30 p-2 lg:w-44 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0 lg:border-r">
            {CATEGORIES.map((c) => {
              const isActive = c.key === active;
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActive(c.key)}
                  aria-current={isActive}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors lg:w-full",
                    isActive
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {t(c.label)}
                </button>
              );
            })}
          </nav>

          {/* 우측 설정 영역 */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {active === "common" && (
              <>
                <GroupBox label={t("options.group.font")}>
                  <SelectField
                    label={t("options.field.font")}
                    value={matchFontPreset(options.common.fontFamily)}
                    onChange={(v) => update("common", { fontFamily: v })}
                    options={fontOptions}
                  />
                  <NumberField
                    label={t("options.field.bodySize")}
                    value={options.common.fontSize}
                    onChange={(v) => update("common", { fontSize: v })}
                    unit={t("options.unit.pt")}
                    min={6}
                    max={72}
                  />
                </GroupBox>
                <GroupBox label={t("options.group.spacing")}>
                  <SpacingFields section="common" options={options} update={update} />
                </GroupBox>
                <GroupBox label={t("options.group.margins")}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <NumberField
                      label={t("options.field.marginTop")}
                      value={options.common.marginTop}
                      onChange={(v) => update("common", { marginTop: v })}
                      unit={t("options.unit.cm")}
                      step={0.5}
                      min={0}
                    />
                    <NumberField
                      label={t("options.field.marginBottom")}
                      value={options.common.marginBottom}
                      onChange={(v) => update("common", { marginBottom: v })}
                      unit={t("options.unit.cm")}
                      step={0.5}
                      min={0}
                    />
                    <NumberField
                      label={t("options.field.marginLeft")}
                      value={options.common.marginLeft}
                      onChange={(v) => update("common", { marginLeft: v })}
                      unit={t("options.unit.cm")}
                      step={0.5}
                      min={0}
                    />
                    <NumberField
                      label={t("options.field.marginRight")}
                      value={options.common.marginRight}
                      onChange={(v) => update("common", { marginRight: v })}
                      unit={t("options.unit.cm")}
                      step={0.5}
                      min={0}
                    />
                  </div>
                </GroupBox>
              </>
            )}

            {active === "title" && (
              <>
                <GroupBox label={t("options.group.style")}>
                  <NumberField
                    label={t("options.field.size")}
                    value={options.title.fontSize}
                    onChange={(v) => update("title", { fontSize: v })}
                    unit={t("options.unit.pt")}
                    min={6}
                    max={72}
                  />
                  <ToggleField
                    label={t("options.field.bold")}
                    checked={options.title.bold}
                    onChange={(v) => update("title", { bold: v })}
                  />
                  <ToggleField
                    label={t("options.field.underline")}
                    checked={options.title.underline}
                    onChange={(v) => update("title", { underline: v })}
                  />
                  <SegmentedField<string>
                    label={t("options.field.align")}
                    value={options.title.align}
                    onChange={(v) => update("title", { align: v })}
                    options={[
                      { label: t("options.align.left"), value: "left", icon: <AlignLeft /> },
                      { label: t("options.align.center"), value: "center", icon: <AlignCenter /> },
                      { label: t("options.align.right"), value: "right", icon: <AlignRight /> },
                    ]}
                  />
                </GroupBox>
                <GroupBox label={t("options.group.spacing")}>
                  <SpacingFields section="title" options={options} update={update} />
                </GroupBox>
              </>
            )}

            {active === "heading" && (
              <HeadingPanel
                level={activeLevel}
                onLevel={setActiveLevel}
                options={options}
                update={update}
              />
            )}

            {active === "annotation" && (
              <>
                <SegmentedField
                  label={t("annotationMode.label")}
                  value={String(options.annotationMode)}
                  onChange={(v) =>
                    onOptionsChange({ ...options, annotationMode: Number(v) as 1 | 2 })
                  }
                  options={[
                    { label: t("annotationMode.inline"), value: "1" },
                    { label: t("annotationMode.paragraph"), value: "2" },
                  ]}
                />
                <GroupBox label={t("options.group.annotation1")}>
                  <NumberField
                    label={t("options.field.size")}
                    value={options.annotation1.fontSize}
                    onChange={(v) => update("annotation1", { fontSize: v })}
                    unit={t("options.unit.pt")}
                    min={6}
                    max={36}
                  />
                  <SelectField
                    label={t("options.field.font")}
                    value={matchFontPreset(options.annotation1.fontFamily)}
                    onChange={(v) => update("annotation1", { fontFamily: v })}
                    options={fontOptions}
                  />
                  <ColorField
                    label={t("options.field.color")}
                    value={options.annotation1.color}
                    onChange={(v) => update("annotation1", { color: v })}
                  />
                </GroupBox>
                <GroupBox label={t("options.group.annotation2")}>
                  <NumberField
                    label={t("options.field.size")}
                    value={options.annotation2.fontSize}
                    onChange={(v) => update("annotation2", { fontSize: v })}
                    unit={t("options.unit.pt")}
                    min={6}
                    max={36}
                  />
                  <SpacingFields section="annotation2" options={options} update={update} />
                  <TextField
                    label={t("options.field.startSymbol")}
                    value={options.annotation2.symbol}
                    onChange={(v) => update("annotation2", { symbol: v })}
                    width="w-20"
                  />
                </GroupBox>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
