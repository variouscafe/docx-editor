import { useState, useEffect, useReducer, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { CellSelection, cellAround, TableMap } from "@tiptap/pm/tables";
import type { Node as PmNode } from "@tiptap/pm/model";
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Minus,
  TableCellsMerge,
  TableCellsSplit,
  Rows3,
  Columns3,
  Rows2,
  Columns2,
  Grid3x3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  PaintBucket,
  Trash2,
  X,
  Hash,
  Calculator,
  Copy,
  CopyPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { highlightColors } from "./extensions/highlightColors";
import { insertTotalsRow } from "./extensions/tableTotalsRow";
import { copyTableToClipboard, duplicateTable } from "./extensions/tableActions";
import type { NumberFormat, FormulaFn, Direction } from "@shared/tableFormula";

interface Props {
  editor: Editor;
}

/** 포맷 옵션 메타. */
const FORMAT_OPTIONS: { value: NumberFormat; key: string }[] = [
  { value: "number", key: "tableCalc.number" },
  { value: "currency", key: "tableCalc.currency" },
  { value: "currencyWon", key: "tableCalc.currencyWon" },
  { value: "number2", key: "tableCalc.number2" },
  { value: "percent", key: "tableCalc.percent" },
];

const FN_OPTIONS: { value: FormulaFn; key: string }[] = [
  { value: "SUM", key: "tableCalc.fn_sum" },
  { value: "AVERAGE", key: "tableCalc.fn_avg" },
  { value: "COUNT", key: "tableCalc.fn_count" },
  { value: "MAX", key: "tableCalc.fn_max" },
  { value: "MIN", key: "tableCalc.fn_min" },
];

const DIR_OPTIONS: { value: Direction; key: string }[] = [
  { value: "ABOVE", key: "tableCalc.dir_above" },
  { value: "BELOW", key: "tableCalc.dir_below" },
  { value: "LEFT", key: "tableCalc.dir_left" },
  { value: "RIGHT", key: "tableCalc.dir_right" },
];

/**
 * 표 편집용 상단 고정 도구모음. 커서/셀 선택이 표 안에 있을 때만 상단 문서 도구모음
 * 바로 아래에 노출된다. 행/열 추가·삭제, 셀 병합/분할, 헤더 행/열 토글, 셀 정렬,
 * 셀 배경음영, 표 복사/복제/삭제. 에디터 선택을 잃지 않도록 각 버튼이 mousedown 기본동작을 막는다.
 */
export function TableToolbar({ editor }: Props) {
  const { t } = useTranslation();
  // 표 안(커서/셀 선택)일 때만 노출. 모든 트랜잭션에서 리렌더해 표시 여부와 버튼 active 를 최신화.
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const update = () => bump();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);
  const [bgOpen, setBgOpen] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  // 계산식 팝오버 내 선택값(기본: 합계/위/금액).
  const [fn, setFn] = useState<FormulaFn>("SUM");
  const [dir, setDir] = useState<Direction>("ABOVE");
  const [resultFmt, setResultFmt] = useState<NumberFormat>("currency");
  // 직접 수식 입력(=A1+B1*0.1, =SUM(B2:B8)*1.1 ...).
  const [exprInput, setExprInput] = useState("");

  // 현재 선택 셀의 포맷/수식(활성 표시용).
  const cellAttrs = editor.getAttributes("tableCell") as {
    format?: string | null;
    formula?: string | null;
  };

  /** 현재 커서/선택이 속한 셀 기준으로 행·열·전체를 CellSelection 으로 잡는다.
   *  모바일에선 마우스 드래그 셀 선택이 안 되므로, 한 번 터치로 범위를 선택하게 함.
   *  이후 가운데 정렬·통화(원) 포맷 등이 선택된 모든 셀에 일괄 적용된다. */
  const selectCells = (kind: "row" | "col" | "all") => {
    const { state, view } = editor;
    // 현재 셀을 견고하게 탐색. 모바일에선 커서($head)가 셀 안을 정확히 가리키지 않을 수 있어
    // $head → $from → $to 순으로 시도하고, CellSelection 중이면 앵커 셀을 쓴다.
    const cur = state.selection;
    const $cell =
      cur instanceof CellSelection
        ? cur.$headCell
        : cellAround(cur.$head) ?? cellAround(cur.$from) ?? cellAround(cur.$to);
    if (!$cell) return;
    try {
      let sel: CellSelection;
      if (kind === "row") {
        sel = CellSelection.rowSelection($cell);
      } else if (kind === "col") {
        sel = CellSelection.colSelection($cell);
      } else {
        // 전체 — 표의 첫 셀 ~ 마지막 셀. TableMap 으로 셀 오프셋 계산.
        let table: PmNode | null = null;
        let tableStart = 0;
        for (let d = $cell.depth; d > 0; d--) {
          const n = $cell.node(d);
          if (n.type.name === "table") {
            table = n;
            tableStart = $cell.start(d);
            break;
          }
        }
        if (!table) return;
        const map = TableMap.get(table);
        sel = CellSelection.create(
          state.doc,
          tableStart + map.map[0],
          tableStart + map.map[map.map.length - 1]
        );
      }
      view.dispatch(state.tr.setSelection(sel).scrollIntoView());
      editor.commands.focus();
    } catch (e) {
      console.error("[selectCells failed]", e);
    }
  };

  /** 작은 토글 버튼(팝오버 내 옵션용). */
  const Opt = ({
    active,
    onClick,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    children: ReactNode;
  }) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`table-calc-opt flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );

  /** 직접 입력한 수식 적용(=A1+B1*0.1 등). */
  const applyExpr = () => {
    const v = exprInput.trim();
    if (!v) return;
    editor
      .chain()
      .focus()
      .setCellFormula(v)
      .setCellFormat(resultFmt)
      .setTextAlign("right")
      .run();
    setExprInput("");
    setCalcOpen(false);
  };

  /** 아이콘 버튼 — 클릭 시 포커스 복귀 + 명령 실행. */
  const Tool = ({
    onClick,
    title,
    active,
    disabled,
    children,
  }: {
    onClick: () => void;
    title: string;
    active?: boolean;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="size-7"
      disabled={disabled}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        editor.chain().focus();
        onClick();
      }}
    >
      {children}
    </Button>
  );

  const Div = () => <Separator orientation="vertical" className="mx-0.5 h-5" />;

  if (!editor.isActive("table")) return null;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-background px-3 py-1.5 [&>*]:shrink-0">
      {/* 행 */}
      <Tool onClick={() => editor.chain().focus().addRowBefore().run()} title={t("toolbar.rowAbove")}>
        <ArrowUpToLine className="size-4" />
      </Tool>
      <Tool onClick={() => editor.chain().focus().addRowAfter().run()} title={t("toolbar.rowBelow")}>
        <ArrowDownToLine className="size-4" />
      </Tool>
      <Tool onClick={() => editor.chain().focus().deleteRow().run()} title={t("toolbar.deleteRow")}>
        <Minus className="size-4" />
      </Tool>

      <Div />

      {/* 열 */}
      <Tool onClick={() => editor.chain().focus().addColumnBefore().run()} title={t("toolbar.colLeft")}>
        <ArrowLeftToLine className="size-4" />
      </Tool>
      <Tool onClick={() => editor.chain().focus().addColumnAfter().run()} title={t("toolbar.colRight")}>
        <ArrowRightToLine className="size-4" />
      </Tool>
      <Tool onClick={() => editor.chain().focus().deleteColumn().run()} title={t("toolbar.deleteColumn")}>
        <Minus className="size-4" />
      </Tool>

      <Div />

      {/* 행/열/전체 선택 — 모바일에선 드래그 대신 한 번 터치로 범위를 잡는다 */}
      <Tool onClick={() => selectCells("row")} title={t("toolbar.selectRow")}>
        <Rows2 className="size-4" />
      </Tool>
      <Tool onClick={() => selectCells("col")} title={t("toolbar.selectColumn")}>
        <Columns2 className="size-4" />
      </Tool>
      <Tool onClick={() => selectCells("all")} title={t("toolbar.selectAll")}>
        <Grid3x3 className="size-4" />
      </Tool>

      <Div />

      {/* 셀 병합/분할 */}
      <Tool
        onClick={() => editor.chain().focus().mergeCells().run()}
        title={t("toolbar.mergeCells")}
        disabled={!editor.can().mergeCells()}
      >
        <TableCellsMerge className="size-4" />
      </Tool>
      <Tool
        onClick={() => editor.chain().focus().splitCell().run()}
        title={t("toolbar.splitCell")}
        disabled={!editor.can().splitCell()}
      >
        <TableCellsSplit className="size-4" />
      </Tool>

      <Div />

      {/* 헤더 행/열 토글 */}
      <Tool onClick={() => editor.chain().focus().toggleHeaderRow().run()} title={t("toolbar.headerRow")}>
        <Rows3 className="size-4" />
      </Tool>
      <Tool onClick={() => editor.chain().focus().toggleHeaderColumn().run()} title={t("toolbar.headerColumn")}>
        <Columns3 className="size-4" />
      </Tool>

      <Div />

      {/* 셀 단락 정렬(TextAlign — 단락 attrs) */}
      <Tool
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        title={t("toolbar.alignLeft")}
        active={editor.isActive({ textAlign: "left" })}
      >
        <AlignLeft className="size-4" />
      </Tool>
      <Tool
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        title={t("toolbar.alignCenter")}
        active={editor.isActive({ textAlign: "center" })}
      >
        <AlignCenter className="size-4" />
      </Tool>
      <Tool
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        title={t("toolbar.alignRight")}
        active={editor.isActive({ textAlign: "right" })}
      >
        <AlignRight className="size-4" />
      </Tool>

      <Div />

      {/* 숫자 포맷(천단위/금액/소수/백분율) */}
      <Popover open={fmtOpen} onOpenChange={setFmtOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={cellAttrs.format ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            title={t("tableCalc.format")}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Hash className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-2">
          <div className="flex flex-col gap-1" style={{ minWidth: 140 }}>
            {FORMAT_OPTIONS.map((opt) => (
              <Opt
                key={opt.value}
                active={cellAttrs.format === opt.value}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .setCellFormat(opt.value)
                    .setTextAlign("right")
                    .run();
                  setFmtOpen(false);
                }}
              >
                {t(opt.key)}
              </Opt>
            ))}
            <div className="my-1 h-px bg-border" />
            <Opt
              active={!cellAttrs.format}
              onClick={() => {
                editor.chain().focus().clearCellFormat().run();
                setFmtOpen(false);
              }}
            >
              {t("tableCalc.clearFormat")}
            </Opt>
          </div>
        </PopoverContent>
      </Popover>

      {/* 계산식(함수 × 방향 × 결과포맷) */}
      <Popover open={calcOpen} onOpenChange={setCalcOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={cellAttrs.formula ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            title={t("tableCalc.formula")}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Calculator className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-2">
          <div className="flex flex-col gap-2" style={{ minWidth: 180 }}>
            {/* 합계 행 자동 추가: 숫자 열 감지해 맨 아래 SUM 행 생성 */}
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-full"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                insertTotalsRow(editor);
                setCalcOpen(false);
              }}
            >
              {t("tableCalc.totalsRow")}
            </Button>
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">
                {t("tableCalc.fn")}
              </div>
              <div className="flex flex-wrap gap-1">
                {FN_OPTIONS.map((o) => (
                  <Opt key={o.value} active={fn === o.value} onClick={() => setFn(o.value)}>
                    {t(o.key)}
                  </Opt>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">
                {t("tableCalc.dir")}
              </div>
              <div className="flex flex-wrap gap-1">
                {DIR_OPTIONS.map((o) => (
                  <Opt key={o.value} active={dir === o.value} onClick={() => setDir(o.value)}>
                    {t(o.key)}
                  </Opt>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">
                {t("tableCalc.resultFormat")}
              </div>
              <div className="flex flex-wrap gap-1">
                {FORMAT_OPTIONS.map((o) => (
                  <Opt
                    key={o.value}
                    active={resultFmt === o.value}
                    onClick={() => setResultFmt(o.value)}
                  >
                    {t(o.key)}
                  </Opt>
                ))}
              </div>
            </div>
            <div className="mt-1 flex gap-1">
              <Button
                size="sm"
                className="h-7 flex-1"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .setCellFormula(`${fn}(${dir})`)
                    .setCellFormat(resultFmt)
                    .setTextAlign("right")
                    .run();
                  setCalcOpen(false);
                }}
              >
                {t("tableCalc.apply")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().clearCellFormula().run();
                  setCalcOpen(false);
                }}
              >
                {t("tableCalc.clearFormula")}
              </Button>
            </div>

            {/* 직접 수식 입력 — 사칙연산/셀참조/함수 혼합 */}
            <div className="mt-2 border-t pt-2">
              <div className="mb-1 text-[11px] text-muted-foreground">
                {t("tableCalc.exprLabel")}
              </div>
              <input
                value={exprInput}
                onChange={(e) => setExprInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyExpr();
                  }
                }}
                placeholder={t("tableCalc.exprPlaceholder")}
                className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                onMouseDown={(e) => e.stopPropagation()}
              />
              <Button
                size="sm"
                variant="secondary"
                className="mt-1 h-7 w-full"
                onMouseDown={(e) => e.preventDefault()}
                onClick={applyExpr}
              >
                {t("tableCalc.apply")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Div />

      {/* 셀 배경음영 */}
      <Popover open={bgOpen} onOpenChange={setBgOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={t("toolbar.cellBackground")}
            onMouseDown={(e) => e.preventDefault()}
          >
            <PaintBucket className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-auto p-2">
          <div className="flex flex-wrap gap-1" style={{ maxWidth: 160 }}>
            <button
              title={t("toolbar.noColor")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetCellBackground().run();
                setBgOpen(false);
              }}
              className="flex size-7 items-center justify-center rounded border text-muted-foreground hover:bg-accent"
            >
              <X className="size-3.5" />
            </button>
            {highlightColors.map((hc) => (
              <button
                key={hc.color}
                title={hc.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().setCellBackground(hc.color).run();
                  setBgOpen(false);
                }}
                className="size-7 rounded border transition-transform hover:scale-110"
                style={{ backgroundColor: hc.color }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Div />

      {/* 표 복사(클립보드) · 복제(인라인) · 삭제 */}
      <Tool
        onClick={() => {
          void copyTableToClipboard(editor);
        }}
        title={t("toolbar.copyTable")}
      >
        <Copy className="size-4" />
      </Tool>
      <Tool onClick={() => duplicateTable(editor)} title={t("toolbar.duplicateTable")}>
        <CopyPlus className="size-4" />
      </Tool>

      <Div />

      {/* 표 삭제(확인) */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            title={t("toolbar.deleteTable")}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("toolbar.deleteTable")}</AlertDialogTitle>
            <AlertDialogDescription>{t("toolbar.deleteTableConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
