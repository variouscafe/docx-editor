import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/* ── 아코디언 섹션 ─────────────────────────────────────────────── */
export function AccordionSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Accordion type="multiple" defaultValue={defaultOpen ? [id] : []}>
      <AccordionItem value={id} className="border-b">
        <AccordionTrigger className="hover:no-underline py-2.5">
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="text-sm font-semibold">{title}</span>
            {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <div className="space-y-2">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/* ── 공통 입력 컨트롤 ──────────────────────────────────────────── */
const rowBase = "flex items-center justify-between gap-2";

/** 섹션 내 소그룹 라벨(예: "단락 뒤"). 필드 사이 구분용 작은 제목. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="pt-1 text-[11px] font-medium text-muted-foreground">{children}</div>;
}

/** 줄 간격 프리셋 — Word 단락 간격 옵션. */
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
      <Label className="shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        {needValue && (
          <Input
            type="number"
            value={val}
            step={value.rule === "multiple" ? 0.1 : 1}
            min={0}
            max={value.rule === "multiple" ? 10 : 200}
            onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
            className="h-8 w-14 text-right text-xs"
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
          <SelectTrigger className="h-8 w-[116px] text-xs">
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

/** 단락 간격 3종(줄 간격·단락 앞·단락 뒤) 묶음. 각 블록 섹션에 배치. */
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
      <GroupLabel>간격</GroupLabel>
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
      <Label className="shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-16 text-right text-xs"
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
      <Label className="shrink-0 text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 max-w-[180px] text-xs">
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
      <Label className="text-xs text-muted-foreground">{label}</Label>
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
      <Label className="shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded border bg-background p-0.5"
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
      <Label className="shrink-0 text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} h-8 text-right text-xs`}
      />
    </div>
  );
}

/** 헤딩 레벨 그룹 라벨 (H1~H6) */
export function LevelGroup({
  label,
  badge,
  children,
}: {
  label: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold">{label}</span>
        <span className="text-[11px] text-muted-foreground">기호:</span>
        <span className="rounded border bg-background px-1.5 py-0.5 text-[11px]">{badge}</span>
      </div>
      {children}
    </div>
  );
}
