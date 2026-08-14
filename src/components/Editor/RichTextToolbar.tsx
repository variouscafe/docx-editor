import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Square,
  Highlighter,
  X,
  Check,
  Table2,
  Undo2,
  Redo2,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { highlightColors } from "./extensions/highlightColors";

interface RichTextToolbarProps {
  editor: Editor | null;
}

export default function RichTextToolbar({ editor }: RichTextToolbarProps) {
  const { t } = useTranslation();
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  // 트랜잭션마다 재렌더 — TipTap v3 useEditor 는 기본적으로 transaction 에 재렌더하지 않아
  // 커서만 옮기면 active/Select 값이 스테일해진다(TableToolbar 와 동일 패턴).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => setTick((n) => n + 1);
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);

  // 실행 취소/다시 실행 단축키 툴팁 — macOS(⌘) vs 기타(Ctrl) 표기 분기.
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || "");
  const modKey = isMac ? "⌘" : "Ctrl+";
  const shiftKey = isMac ? "⇧" : "Shift+";

  if (!editor) return null;

  const handleAnnotationConfirm = () => {
    // 빈 값 확정 = 주석 해제, 값 있으면 덮어쓰기(기존 주석 수정 경로).
    if (annotationText.trim()) {
      editor.chain().focus().setAnnotation(annotationText.trim()).run();
    } else if (editor.isActive("annotation")) {
      editor.chain().focus().unsetAnnotation().run();
    }
    setAnnotationMode(false);
    setAnnotationText("");
  };

  const handleAnnotationCancel = () => {
    setAnnotationMode(false);
    setAnnotationText("");
  };

  const tools = [
    {
      icon: <Bold className="size-4" />,
      action: () => editor.chain().focus().toggleBold().run(),
      title: t("toolbar.bold"),
      active: editor.isActive("bold"),
    },
    {
      icon: <Italic className="size-4" />,
      action: () => editor.chain().focus().toggleItalic().run(),
      title: t("toolbar.italic"),
      active: editor.isActive("italic"),
    },
    {
      icon: <Underline className="size-4" />,
      action: () => editor.chain().focus().toggleUnderline().run(),
      title: t("toolbar.underline"),
      active: editor.isActive("underline"),
    },
    { divider: true },
    {
      icon: <AlignLeft className="size-4" />,
      action: () => editor.chain().focus().setTextAlign("left").run(),
      title: t("toolbar.alignLeft"),
      active: editor.isActive({ textAlign: "left" }),
    },
    {
      icon: <AlignCenter className="size-4" />,
      action: () => editor.chain().focus().setTextAlign("center").run(),
      title: t("toolbar.alignCenter"),
      active: editor.isActive({ textAlign: "center" }),
    },
    {
      icon: <AlignRight className="size-4" />,
      action: () => editor.chain().focus().setTextAlign("right").run(),
      title: t("toolbar.alignRight"),
      active: editor.isActive({ textAlign: "right" }),
    },
    { divider: true },
    {
      icon: <Square className="size-4" />,
      action: () => {
        // 활성 variant 는 해제, 그 외(꺼짐·다른 variant)는 solid 로 전환 — 원클릭 전환.
        if (editor.isActive("boxBorder", { "data-border": "solid" }))
          editor.chain().focus().unsetBox().run();
        else editor.chain().focus().setSolidBox().run();
      },
      title: t("toolbar.boxSolid"),
      active: editor.isActive("boxBorder", { "data-border": "solid" }),
    },
    {
      icon: <Square className="size-4" />,
      action: () => {
        if (editor.isActive("boxBorder", { "data-border": "dashed" }))
          editor.chain().focus().unsetBox().run();
        else editor.chain().focus().setDashedBox().run();
      },
      title: t("toolbar.boxDashed"),
      variant: "dashed" as const,
      active: editor.isActive("boxBorder", { "data-border": "dashed" }),
    },
    {
      icon: <span className="text-xs font-bold">[ ]</span>,
      action: () => editor.chain().focus().toggleMark("coreSummary").run(),
      title: t("toolbar.coreSummary"),
      active: editor.isActive("coreSummary"),
    },
    { divider: true },
    {
      icon: (
        // 언어 중립 아이콘(한글 '주' 글자 대체) — 작게 + primary 색상 의도 유지.
        <StickyNote className="size-3.5 text-primary" />
      ),
      action: () => {
        // 이미 주석이면 해제하지 않고 수정 팝업을 연다(기존 값 프리필).
        if (editor.isActive("annotation")) {
          setAnnotationText(
            String(editor.getAttributes("annotation")["data-annotation"] ?? ""),
          );
        } else {
          setAnnotationText("");
        }
        setAnnotationMode(true);
      },
      title: t("toolbar.annotation"),
      active: editor.isActive("annotation"),
    },
  ];

  const headingValue = editor.isActive("title")
    ? "title"
    : editor.isActive("heading", { level: 1 })
      ? "1"
      : editor.isActive("heading", { level: 2 })
        ? "2"
        : editor.isActive("heading", { level: 3 })
          ? "3"
          : editor.isActive("heading", { level: 4 })
            ? "4"
            : editor.isActive("heading", { level: 5 })
              ? "5"
              : editor.isActive("heading", { level: 6 })
                ? "6"
                : "paragraph";

  const fontSizeValue =
    [10, 12, 14, 16, 18, 20, 24]
      .find((pt) => editor.isActive("fontSize", { fontSize: pt }))
      ?.toString() ?? "default";

  return (
    <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b bg-background px-3 py-2 lg:flex-wrap [&>*]:shrink-0">
      {/* 실행 취소 / 다시 실행 — 도구 모음 최좌측.
          히스토리는 ProseMirror UndoRedo(StarterKit 내장)가 브라우저 메모리에만 보관 →
          서버에는 content(JSON)만 저장되고 undo/redo 스택은 영속화되지 않는다(웹에서만). */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={`${t("toolbar.undo")} (${modKey}Z)`}
          aria-label={t("toolbar.undo")}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={`${t("toolbar.redo")} (${modKey}${shiftKey}Z)`}
          aria-label={t("toolbar.redo")}
        >
          <Redo2 className="size-4" />
        </Button>
      </div>
      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Heading select */}
      <Select
        value={headingValue}
        onValueChange={(level) => {
          if (level === "paragraph") editor.chain().focus().setParagraph().run();
          else if (level === "title") editor.chain().focus().setNode("title").run();
          else
            editor.chain().focus().toggleHeading({ level: Number(level) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        }}
      >
        <SelectTrigger className="h-8 w-[110px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="title">{t("toolbar.title")}</SelectItem>
          <SelectItem value="paragraph">{t("toolbar.body")}</SelectItem>
          <SelectGroup>
            <SelectLabel>{t("toolbar.heading")}</SelectLabel>
            {[1, 2, 3, 4, 5, 6].map((l) => (
              <SelectItem key={l} value={String(l)}>
                {t("toolbar.headingLevel", { level: l })}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Font size */}
      <Select
        value={fontSizeValue}
        onValueChange={(v) => {
          if (v === "default") editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(Number(v)).run();
        }}
      >
        <SelectTrigger className="h-8 w-[92px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">{t("toolbar.defaultSize")}</SelectItem>
          {[10, 12, 14, 16, 18, 20, 24].map((pt) => (
            <SelectItem key={pt} value={String(pt)}>
              {pt}pt
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 표 삽입 — N×M 그리드 선택기 */}
      <Popover
        open={tableOpen}
        onOpenChange={(o) => {
          setTableOpen(o);
          if (!o) setHoverCell(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title={t("toolbar.insertTable")}
            aria-label={t("toolbar.insertTable")}
          >
            <Table2 className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <div className="flex flex-col gap-0.5">
            {Array.from({ length: 10 }, (_, r) => (
              <div key={r} className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, c) => {
                  const on = hoverCell && r <= hoverCell.r && c <= hoverCell.c;
                  return (
                    <button
                      key={c}
                      className={`size-3 rounded-sm border ${on ? "bg-primary" : ""}`}
                      aria-label={`${r + 1} × ${c + 1}`}
                      onMouseEnter={() => setHoverCell({ r, c })}
                      onClick={() => {
                        editor
                          .chain()
                          .focus()
                          .insertTable({ rows: r + 1, cols: c + 1, withHeaderRow: true })
                          .run();
                        setTableOpen(false);
                        setHoverCell(null);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {hoverCell ? `${hoverCell.r + 1} × ${hoverCell.c + 1}` : t("toolbar.insertTable")}
          </p>
        </PopoverContent>
      </Popover>

      {tools.map((tool, i) => {
        if ("divider" in tool) {
          return <Separator key={i} orientation="vertical" className="mx-1 h-6" />;
        }
        return (
          <Button
            key={i}
            variant={tool.active ? "secondary" : "ghost"}
            size="icon"
            className="size-8"
            onClick={tool.action}
            title={tool.title}
            aria-label={tool.title}
            style={
              tool.variant === "dashed"
                ? { border: "1.5px dashed currentColor", borderRadius: 2 }
                : undefined
            }
          >
            {tool.icon}
          </Button>
        );
      })}

      {/* Highlight color buttons */}
      <div className="flex items-center gap-0.5">
        <Highlighter className="mr-1 size-4 text-muted-foreground" />
        {highlightColors.map((hc) => (
          <button
            key={hc.color}
            onClick={() => editor.chain().focus().toggleHighlight({ color: hc.color }).run()}
            title={t(hc.key)}
            aria-label={t(hc.key)}
            className="size-6 rounded border transition-transform hover:scale-110"
            style={{ backgroundColor: hc.color }}
          />
        ))}
      </div>

      {/* Annotation input popup */}
      {annotationMode && (
        <div className="ml-2 flex items-center gap-1 rounded border bg-background px-2 py-1 shadow-sm">
          <Input
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAnnotationConfirm();
              if (e.key === "Escape") handleAnnotationCancel();
            }}
            placeholder={t("toolbar.annotationPlaceholder")}
            className="h-7 w-32 border-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-green-600"
            onClick={handleAnnotationConfirm}
            aria-label={t("toolbar.annotationConfirm")}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-destructive"
            onClick={handleAnnotationCancel}
            aria-label={t("common.cancel")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
