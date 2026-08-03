import { useState, useEffect } from "react";
import { Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocxOptions } from "@shared/options";
import { LineStartSymbol, getSymbolDisplay } from "@shared/lineStartSymbol";
import { getEffectiveLeadingSpaces } from "@shared/symbols";
import {
  AccordionSection,
  NumberField,
  SelectField,
  ToggleField,
  ColorField,
  TextField,
  LevelGroup,
  SpacingFields,
  type SpacingSection,
  FONT_PRESETS,
  matchFontPreset,
} from "./fields";

interface OptionsPanelProps {
  options: DocxOptions;
  onOptionsChange: (options: DocxOptions) => void;
}

const ALIGN_OPTIONS = [
  { label: "왼쪽", value: "left" },
  { label: "가운데", value: "center" },
  { label: "오른쪽", value: "right" },
];

const FORCED_LEADING = (s: LineStartSymbol) =>
  s === LineStartSymbol.SQUARE || s === LineStartSymbol.DASH || s === LineStartSymbol.BULLET;

export default function OptionsPanel({ options, onOptionsChange }: OptionsPanelProps) {
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(options, null, 2));
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <h3 className="text-sm font-semibold">옵션</h3>
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
        <>
          {error && (
            <div className="border-b bg-destructive/10 px-3 py-1 text-xs text-destructive">
              {error}
            </div>
          )}
          <textarea
            className="flex-1 resize-none p-3 font-mono text-xs outline-none"
            value={jsonText}
            onChange={(e) => handleJson(e.target.value)}
            spellCheck={false}
          />
        </>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* 공통 */}
          <AccordionSection title="공통" subtitle="글꼴 · 크기 · 여백" defaultOpen>
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
            <SpacingFields section="common" options={options} update={update} />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
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
          </AccordionSection>

          {/* 제목 */}
          <AccordionSection title="제목" subtitle="문서 제목 스타일">
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
            <SelectField
              label="정렬"
              value={options.title.align}
              onChange={(v) => update("title", { align: v })}
              options={ALIGN_OPTIONS}
            />
            <SpacingFields section="title" options={options} update={update} />
          </AccordionSection>

          {/* 헤딩 */}
          <AccordionSection title="헤딩" subtitle="H1~H6 간격 · 선행공백 (기호는 좌측에서 선택)">
            {([1, 2, 3, 4, 5, 6] as const).map((level) => {
              const key = `h${level}` as keyof DocxOptions;
              // h1~h6 union(leadingSpaces 유무 다름) → 런타임 안전 접근
              const heading = options[key] as {
                lineStartSymbol: LineStartSymbol;
                leadingSpaces?: number;
              };
              const sym = heading.lineStartSymbol;
              const forced = FORCED_LEADING(sym);
              // H1~H6 모두 선행 공백 편집 가능(□/-/• 은 사내 규격으로 고정).
              const hasLeading = true;
              const effLeading = getEffectiveLeadingSpaces(sym, heading.leadingSpaces ?? 0);
              return (
                <LevelGroup key={level} label={`H${level}`} badge={getSymbolDisplay(sym)}>
                  {level === 1 && (
                    <>
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
                    </>
                  )}
                  <SpacingFields
                    section={`h${level}` as SpacingSection}
                    options={options}
                    update={update}
                  />
                  {hasLeading && (
                    <>
                      <NumberField
                        label="선행 공백"
                        value={effLeading}
                        onChange={(v) => update(key, { leadingSpaces: v })}
                        disabled={forced}
                        min={0}
                        max={12}
                      />
                      {forced && (
                        <p className="-mt-1 text-[10px] text-muted-foreground">
                          이 기호는 고정 {effLeading}칸
                        </p>
                      )}
                    </>
                  )}
                </LevelGroup>
              );
            })}
          </AccordionSection>

          {/* 꼬마글씨 */}
          <AccordionSection title="꼬마글씨" subtitle="부연 설명 (모드는 좌측에서 선택)">
            <div className="pt-1 text-[11px] font-medium text-muted-foreground">꼬마글씨1 (인라인)</div>
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
            <div className="pt-2 text-[11px] font-medium text-muted-foreground">꼬마글씨2 (단락)</div>
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
          </AccordionSection>
        </div>
      )}
    </div>
  );
}
