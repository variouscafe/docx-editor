import { useState, useEffect } from "react";
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
import { cn } from "@/lib/utils";
import type { DocxOptions } from "@shared/options";
import { LineStartSymbol, getSymbolDisplay } from "@shared/lineStartSymbol";
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
  { key: "common", label: "공통", icon: Type },
  { key: "title", label: "제목", icon: Heading1 },
  { key: "heading", label: "헤딩", icon: ListOrdered },
  { key: "annotation", label: "꼬마글씨", icon: StickyNote },
];

/** 헤딩 — 레벨 탭(H1~H6) + 활성 레벨의 GroupBox(스타일·간격·기호). 기호는 좌측 툴바에서 선택. */
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
  const key = `h${level}` as keyof DocxOptions;
  // h1~h6 union(leadingSpaces 유무 다름) → 런타임 안전 접근
  const heading = options[key] as { lineStartSymbol: LineStartSymbol; leadingSpaces?: number };
  const sym = heading.lineStartSymbol;
  const forced = FORCED_LEADING(sym);
  const effLeading = getEffectiveLeadingSpaces(sym, heading.leadingSpaces ?? 0);

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
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              H{lvl}
            </button>
          );
        })}
      </div>

      {/* 현재 기호 안내 */}
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        현재 기호
        <span className="rounded border bg-background px-1.5 py-0.5 text-foreground">
          {getSymbolDisplay(sym)}
        </span>
        <span className="text-[11px]">— 좌측 상단 툴바에서 변경</span>
      </div>

      {level === 1 && (
        <GroupBox label="스타일">
          <NumberField
            label="크기"
            value={options.h1.fontSize}
            onChange={(v) => update("h1", { fontSize: v })}
            unit="pt"
            min={6}
            max={72}
          />
          <ToggleField
            label="굵게"
            checked={options.h1.bold}
            onChange={(v) => update("h1", { bold: v })}
          />
        </GroupBox>
      )}

      <GroupBox label="간격">
        <SpacingFields section={`h${level}` as SpacingSection} options={options} update={update} />
      </GroupBox>

      <GroupBox label="선행 공백">
        <NumberField
          label="칸 수"
          value={effLeading}
          onChange={(v) => update(key, { leadingSpaces: v })}
          disabled={forced}
          min={0}
          max={12}
        />
        {forced ? (
          <p className="text-[11px] text-muted-foreground">이 기호는 고정 {effLeading}칸입니다.</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">줄 시작 기호 앞의 들여쓰기 칸 수.</p>
        )}
      </GroupBox>
    </>
  );
}

export default function OptionsPanel({ options, onOptionsChange }: OptionsPanelProps) {
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(options, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Category>("common");
  const [activeLevel, setActiveLevel] = useState(1);

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
      setError("잘못된 JSON 형식");
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success("JSON을 복사했어요");
    } catch {
      toast.error("복사에 실패했어요");
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
      setError("잘못된 JSON 형식");
      toast.error("잘못된 JSON 형식이에요");
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
          문서 설정
        </h3>
        <Button
          type="button"
          variant={showJson ? "default" : "ghost"}
          size="sm"
          onClick={() => setShowJson((s) => !s)}
          title="JSON 직접 편집"
        >
          <Code className="size-3" />
          JSON
        </Button>
      </div>

      {showJson ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* JSON 툴바 */}
          <div className="flex shrink-0 items-center gap-1 border-b bg-muted/30 px-4 py-2">
            <span className="px-1 text-[11px] text-muted-foreground">JSON 편집</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="xs" onClick={() => void copyJson()} title="복사">
                <Copy /> 복사
              </Button>
              <Button variant="ghost" size="xs" onClick={formatJson} title="포맷 정렬">
                <Braces /> 포맷
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
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {c.label}
                </button>
              );
            })}
          </nav>

          {/* 우측 설정 영역 */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {active === "common" && (
              <>
                <GroupBox label="글꼴">
                  <SelectField
                    label="글꼴"
                    value={matchFontPreset(options.common.fontFamily)}
                    onChange={(v) => update("common", { fontFamily: v })}
                    options={FONT_PRESETS}
                  />
                  <NumberField
                    label="본문 크기"
                    value={options.common.fontSize}
                    onChange={(v) => update("common", { fontSize: v })}
                    unit="pt"
                    min={6}
                    max={72}
                  />
                </GroupBox>
                <GroupBox label="간격">
                  <SpacingFields section="common" options={options} update={update} />
                </GroupBox>
                <GroupBox label="여백">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <NumberField
                      label="위"
                      value={options.common.marginTop}
                      onChange={(v) => update("common", { marginTop: v })}
                      unit="cm"
                      step={0.5}
                      min={0}
                    />
                    <NumberField
                      label="아래"
                      value={options.common.marginBottom}
                      onChange={(v) => update("common", { marginBottom: v })}
                      unit="cm"
                      step={0.5}
                      min={0}
                    />
                    <NumberField
                      label="왼쪽"
                      value={options.common.marginLeft}
                      onChange={(v) => update("common", { marginLeft: v })}
                      unit="cm"
                      step={0.5}
                      min={0}
                    />
                    <NumberField
                      label="오른쪽"
                      value={options.common.marginRight}
                      onChange={(v) => update("common", { marginRight: v })}
                      unit="cm"
                      step={0.5}
                      min={0}
                    />
                  </div>
                </GroupBox>
              </>
            )}

            {active === "title" && (
              <>
                <GroupBox label="스타일">
                  <NumberField
                    label="크기"
                    value={options.title.fontSize}
                    onChange={(v) => update("title", { fontSize: v })}
                    unit="pt"
                    min={6}
                    max={72}
                  />
                  <ToggleField
                    label="굵게"
                    checked={options.title.bold}
                    onChange={(v) => update("title", { bold: v })}
                  />
                  <ToggleField
                    label="밑줄"
                    checked={options.title.underline}
                    onChange={(v) => update("title", { underline: v })}
                  />
                  <SegmentedField<string>
                    label="정렬"
                    value={options.title.align}
                    onChange={(v) => update("title", { align: v })}
                    options={[
                      { label: "왼쪽", value: "left", icon: <AlignLeft /> },
                      { label: "가운데", value: "center", icon: <AlignCenter /> },
                      { label: "오른쪽", value: "right", icon: <AlignRight /> },
                    ]}
                  />
                </GroupBox>
                <GroupBox label="간격">
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
                <GroupBox label="꼬마글씨1 · 인라인">
                  <NumberField
                    label="크기"
                    value={options.annotation1.fontSize}
                    onChange={(v) => update("annotation1", { fontSize: v })}
                    unit="pt"
                    min={6}
                    max={36}
                  />
                  <SelectField
                    label="글꼴"
                    value={matchFontPreset(options.annotation1.fontFamily)}
                    onChange={(v) => update("annotation1", { fontFamily: v })}
                    options={FONT_PRESETS}
                  />
                  <ColorField
                    label="색상"
                    value={options.annotation1.color}
                    onChange={(v) => update("annotation1", { color: v })}
                  />
                </GroupBox>
                <GroupBox label="꼬마글씨2 · 단락">
                  <NumberField
                    label="크기"
                    value={options.annotation2.fontSize}
                    onChange={(v) => update("annotation2", { fontSize: v })}
                    unit="pt"
                    min={6}
                    max={36}
                  />
                  <SpacingFields section="annotation2" options={options} update={update} />
                  <TextField
                    label="시작 기호"
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
