import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { CellSelection } from "@tiptap/pm/tables";
import { Bold, Underline, StickyNote, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SelectionTextToolProps {
  editor: Editor | null;
  /** 미리보기 스크롤 컨테이너 — 스크롤 시 위치 재계산용. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 텍스트 드래그 선택 시 뜨는 플로팅 텍스트 도구 — 굵게/밑줄/꼬마글씨.
 * 비영속 React 오버레이(position:fixed, DOM 조작·문서 변경 없음).
 * 선택 영역 viewport 좌표(view.coordsAtPos) 위에 배치 → A4 축소(scale) 무관.
 */
export default function SelectionTextTool({ editor, scrollRef }: SelectionTextToolProps) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  // 툴바 실측 폭 — 중앙 정렬 변환에 사용(렌더 후 갱신).
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barWidth, setBarWidth] = useState(150);

  const update = useCallback(() => {
    if (!editor || editor.isDestroyed) return setPos(null);
    const sel = editor.state.selection;
    // 빈 선택·표 셀 선택(CellSelection)·에디터 비포커스 → 숨김.
    // 꼬마글씨 입력 중엔 입력 상자 포커스로 유지.
    if ((sel.empty && !annotationMode) || sel instanceof CellSelection) return setPos(null);
    if (!editor.isFocused && !annotationMode) return setPos(null);
    try {
      const s = editor.view.coordsAtPos(sel.from);
      const e = editor.view.coordsAtPos(sel.to);
      const top = Math.min(s.top, e.top);
      const left = (Math.min(s.left, e.left) + Math.max(s.right, e.right)) / 2;
      setPos({ top, left });
    } catch {
      setPos(null);
    }
  }, [editor, annotationMode]);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    const sc = scrollRef.current;
    sc?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      sc?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [editor, update, scrollRef]);

  // 툴바 폭 측정(중앙 정렬).
  useEffect(() => {
    if (barRef.current) setBarWidth(barRef.current.offsetWidth);
  }, [pos !== null, annotationMode]);

  if (!editor || !pos) return null;

  const confirmAnnotation = () => {
    const text = annotationText.trim();
    if (text) {
      editor.chain().focus().setAnnotation(text).run();
    } else if (editor.isActive("annotation")) {
      // 빈 값 확인 = 주석 해제 — 상단 RichTextToolbar 와 동일 규칙(옛 주석 잔존 방지).
      editor.chain().focus().unsetAnnotation().run();
    }
    setAnnotationMode(false);
    setAnnotationText("");
  };

  const tools = [
    {
      icon: <Bold className="size-3.5" />,
      title: t("toolbar.bold"),
      active: editor.isActive("bold"),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: <Underline className="size-3.5" />,
      title: t("toolbar.underline"),
      active: editor.isActive("underline"),
      action: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      icon: <StickyNote className="size-3.5" />,
      title: t("toolbar.annotation"),
      active: editor.isActive("annotation"),
      action: () => {
        // 이미 주석이면 기존 값 프리필(상단 툴바와 동일 UX).
        setAnnotationText(
          editor.isActive("annotation")
            ? String(editor.getAttributes("annotation")["data-annotation"] ?? "")
            : "",
        );
        setAnnotationMode(true);
      },
    },
  ];

  return (
    <div
      ref={barRef}
      className="fixed z-30 flex items-center gap-0.5 rounded-md border bg-background px-1 py-1 shadow-lg print:hidden"
      style={{
        // 좌우 모두 클램프 — 뷰포트 우측/하단에서 툴바가 화면 밖으로 넘치지 않게.
        top: Math.min(Math.max(8, pos.top - 44), window.innerHeight - 44),
        left: Math.min(Math.max(8, pos.left - barWidth / 2), Math.max(8, window.innerWidth - barWidth - 8)),
        visibility: barWidth ? "visible" : "hidden",
      }}
      // 툴바 클릭/드래그가 선택 해제로 이어지지 않게 방해.
      onMouseDown={(e) => e.preventDefault()}
    >
      {!annotationMode ? (
        tools.map((tool) => (
          <Button
            key={tool.title}
            variant={tool.active ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            onClick={tool.action}
            title={tool.title}
            aria-label={tool.title}
          >
            {tool.icon}
          </Button>
        ))
      ) : (
        <div className="flex items-center gap-1 px-1">
          <Input
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAnnotation();
              if (e.key === "Escape") {
                setAnnotationMode(false);
                setAnnotationText("");
              }
            }}
            placeholder={t("toolbar.annotationPlaceholder")}
            className="h-7 w-36 border-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-green-600"
            onClick={confirmAnnotation}
            aria-label={t("toolbar.annotationConfirm")}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-destructive"
            onClick={() => {
              setAnnotationMode(false);
              setAnnotationText("");
            }}
            aria-label={t("common.cancel")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
