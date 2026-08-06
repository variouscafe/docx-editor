import { type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DocxOptions, LineSpacing, LineSpacingRule } from "@shared/options";

/** 글꼴 프리셋 — value 는 shared/options.ts 의 기본 폰트 스택과 동일 문자열 사용(매칭 위해). */
export const BATANG =
  "Batang, BatangChe, 바탕, 바탕체, 'Batang Che', 'Nanum Myeongjo', AppleMyungjo, serif";
const GOTHIC = "'Malgun Gothic', 'Nanum Gothic', 'Apple SD Gothic Neo', sans-serif";
const DOTUM = "'Dotum', 'AppleMyungjo', sans-serif";

export const FONT_PRESETS = [
  { label: "바탕", value: BATANG },
  { label: "고딕", value: GOTHIC },
  { label: "돋움", value: DOTUM },
];

/** value 와 매칭되는 프리셋 value 반환(없으면 첫 프리셋). select 제어용. */
export function matchFontPreset(value: string): string {
  return FONT_PRESETS.find((f) => f.value === value)?.value ?? FONT_PRESETS[0].value;
}

/* ── 공통 스타일 토큰 ─────────────────────────────────────────────── */
const rowBase = "flex items-center justify-between gap-2";
// 모바일 터치 영역 확보 + 라벨 대비 향상. h-9(36px), foreground/80.
const LABEL_CLS = "shrink-0 text-xs font-medium text-foreground/80";

/* ── Word 그룹박스 (fieldset/legend) ─────────────────────────────── */
/** 둥근 테두리 위에 제목(legend)이 걸치는 전통 폼 다이얼로그 스타일. */
export function GroupBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">{label}</legend>
      {children}
    </fieldset>
  );
}

/* ── 세그먼트 토글 ─────────────────────────────────────────────── */
/** 2~3 버튼 그룹(활성 = 반전). 정렬·공개범위 등 좁은 선택용. 모바일 친화적. */
export function SegmentedField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T; icon?: ReactNode }[];
}) {
  return (
    <div className={label ? rowBase : "flex"}>
      {label && <Label className={LABEL_CLS}>{label}</Label>}
      <div
        className={cn(
          "inline-flex gap-0.5 overflow-hidden rounded-md border bg-muted/50 p-0.5",
          label ? "flex-1" : "w-full"
        )}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1 rounded-[5px] text-xs font-medium transition-colors [&_svg]:size-3.5",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 줄 간격 ──────────────────────────────────────────────────── */
const LINE_SPACING_PRESETS: { label: string; value: LineSpacingRule }[] = [
  { label: "한 줄 (1.0)", value: "single" },
  { label: "1.15줄", value: "1.15" },
  { label: "1.5줄", value: "1.5" },
  { label: "두 줄 (2.0)", value: "double" },
  { label: "최소값", value: "atLeast" },
  { label: "정확히", value: "exact" },
  { label: "배수", value: "multiple" },
];

/** 줄 간격 — 프리셋 Select + (최소값/정확히/배수일 때) 값 입력(또는 pt). */
export function LineSpacingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LineSpacing;
  onChange: (v: LineSpacing) => void;
}) {
  const needValue = value.rule === "atLeast" || value.rule === "exact" || value.rule === "multiple";
  const unit = value.rule === "multiple" ? "배" : "pt";
  const val = value.rule === "multiple" ? value.value ?? 1.6 : value.value ?? 16;
  return (
    <div className={rowBase}>
      <Label className={LABEL_CLS}>{label}</Label>
      <div className="flex items-center gap-1">
        {needValue && (
          <Input
            type="number"
            value={val}
            step={value.rule === "multiple" ? 0.1 : 1}
            min={0}
            max={value.rule === "multiple" ? 10 : 200}
            onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
            className="h-9 w-14 text-right text-xs"
          />
        )}
        {needValue && <span className="w-5 text-[11px] text-muted-foreground">{unit}</span>}
        <Select
          value={value.rule}
          onValueChange={(r) => {
            const needsV = r === "atLeast" || r === "exact" || r === "multiple";
            // 규칙 전환 시 값 미입력 방지(최소/정확히 → 0pt, 배수 → 미정의 되는 버그).
            const dv = r === "multiple" ? 1.6 : 16;
            onChange({ rule: r as LineSpacingRule, value: needsV ? dv : undefined });
          }}
        >
          <SelectTrigger className="h-9 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINE_SPACING_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

type SpacingSection = "common" | "title" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "annotation2";
export type { SpacingSection };

/** 단락 간격 3종(줄 간격·단락 앞·단락 뒤). GroupBox("간격") 안에 배치 — 라벨은 제거. */
export function SpacingFields({
  section,
  options,
  update,
}: {
  section: SpacingSection;
  options: DocxOptions;
  update: (key: keyof DocxOptions, patch: Record<string, unknown>) => void;
}) {
  const sec = options[section];
  return (
    <>
      <LineSpacingField
        label="줄 간격"
        value={sec.lineSpacing}
        onChange={(v) => update(section, { lineSpacing: v })}
      />
      <NumberField
        label="단락 앞"
        value={sec.spacingBefore}
        onChange={(v) => update(section, { spacingBefore: v })}
        unit="pt"
        min={0}
        max={120}
      />
      <NumberField
        label="단락 뒤"
        value={sec.paragraphSpacing}
        onChange={(v) => update(section, { paragraphSpacing: v })}
        unit="pt"
        min={0}
        max={120}
      />
    </>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <div className={rowBase}>
      <Label className={LABEL_CLS}>{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 w-16 text-right text-xs"
        />
        {unit && <span className="w-6 text-[11px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className={rowBase}>
      <Label className={LABEL_CLS}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 max-w-[180px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={rowBase}>
      <Label className="text-xs font-medium text-foreground/80">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={rowBase}>
      <Label className={LABEL_CLS}>{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 cursor-pointer rounded-md border bg-background p-0.5"
        />
        <span className="w-16 text-[11px] tabular-nums text-muted-foreground">
          {value.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  width = "w-16",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  width?: string;
}) {
  return (
    <div className={rowBase}>
      <Label className={LABEL_CLS}>{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} h-9 text-right text-xs`}
      />
    </div>
  );
}
