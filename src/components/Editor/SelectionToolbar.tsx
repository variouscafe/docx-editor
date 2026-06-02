import { useState, useEffect, useCallback, useRef, type RefObject } from "react";
import { Bold, Underline, Type, Check, X } from "lucide-react";

interface SelectionToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  setContent: (v: string) => void;
}

/** Wrap selected text with before/after markers */
function wrapSelection(
  textarea: HTMLTextAreaElement,
  content: string,
  setContent: (v: string) => void,
  before: string,
  after: string,
) {
  const { selectionStart, selectionEnd } = textarea;
  const selected = content.substring(selectionStart, selectionEnd);

  const newContent =
    content.substring(0, selectionStart) + before + selected + after + content.substring(selectionEnd);
  setContent(newContent);
  requestAnimationFrame(() => {
    textarea.selectionStart = selectionStart + before.length;
    textarea.selectionEnd = selectionEnd + before.length;
    textarea.focus();
  });
}

export default function SelectionToolbar({ textareaRef, content, setContent }: SelectionToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // 꼬마글씨 입력 모드 상태
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationRange, setAnnotationRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [annotationText, setAnnotationText] = useState("");
  const annotationInputRef = useRef<HTMLInputElement>(null);

  const updatePosition = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      setVisible(false);
      return;
    }

    // Calculate position based on textarea
    const rect = ta.getBoundingClientRect();
    const parentRect = ta.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    // Use a temporary span to measure selection position
    const textBefore = ta.value.substring(0, start);
    const lines = textBefore.split("\n");
    const lineHeight = 22; // approximate line height for text-sm
    const topOffset = lines.length * lineHeight;

    setPosition({
      top: Math.min(topOffset - ta.scrollTop, rect.height - 40),
      left: 40,
    });
    setVisible(true);
  }, [textareaRef]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const onUp = () => {
      // Delay to let selection settle
      requestAnimationFrame(() => {
        if (ta.selectionStart !== ta.selectionEnd) {
          updatePosition();
        } else {
          setVisible(false);
        }
      });
    };

    ta.addEventListener("mouseup", onUp);
    ta.addEventListener("keyup", onUp);

    return () => {
      ta.removeEventListener("mouseup", onUp);
      ta.removeEventListener("keyup", onUp);
    };
  }, [textareaRef, updatePosition]);

  // Hide on scroll
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const onScroll = () => setVisible(false);
    ta.addEventListener("scroll", onScroll);
    return () => ta.removeEventListener("scroll", onScroll);
  }, [textareaRef]);

  // 꼬마글씨 모드 진입
  const handleAnnotationClick = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    setAnnotationRange({ start: ta.selectionStart, end: ta.selectionEnd });
    setAnnotationText("");
    setAnnotationMode(true);
    // autoFocus after render
    requestAnimationFrame(() => {
      annotationInputRef.current?.focus();
    });
  };

  // 꼬마글씨 확인
  const handleAnnotationConfirm = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = annotationRange;
    const selected = content.substring(start, end);
    const before = "{{";
    const after = `|${annotationText}}}`;
    const newContent =
      content.substring(0, start) + before + selected + after + content.substring(end);
    setContent(newContent);

    setAnnotationMode(false);
    setVisible(false);

    // 커서를 설명 텍스트 위치에 배치 (선택 상태로)
    requestAnimationFrame(() => {
      const annotationStart = start + before.length + selected.length + 1; // +1 for |
      const annotationEnd = annotationStart + annotationText.length;
      ta.selectionStart = annotationStart;
      ta.selectionEnd = annotationEnd;
      ta.focus();
    });
  };

  // 꼬마글씨 취소
  const handleAnnotationCancel = () => {
    setAnnotationMode(false);
    setAnnotationText("");
  };

  // Enter/Escape 키 처리
  const handleAnnotationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAnnotationConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleAnnotationCancel();
    }
  };

  if (!visible && !annotationMode) return null;

  const ta = textareaRef.current;
  if (!ta) return null;

  // 꼬마글씨 입력 모드 UI
  if (annotationMode) {
    const selectedText = content.substring(annotationRange.start, annotationRange.end);
    return (
      <div
        className="absolute z-50 flex items-center gap-2 bg-white rounded-lg shadow-lg border border-gray-300 px-3 py-2"
        style={{ top: position.top, left: position.left }}
      >
        {/* 좌측: 선택된 원문 텍스트 (수정 불가) */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium text-gray-400 shrink-0">원문</span>
          <span className="text-sm text-gray-800 bg-gray-100 px-2 py-1 rounded max-w-[160px] truncate font-mono">
            {selectedText}
          </span>
        </div>
        {/* 구분선 */}
        <div className="w-px h-6 bg-gray-300 shrink-0" />
        {/* 우측: 설명 입력창 */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-gray-400 shrink-0">설명</span>
          <input
            ref={annotationInputRef}
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={handleAnnotationKeyDown}
            placeholder="부연 설명 입력..."
            className="w-40 text-sm px-2 py-1 border border-gray-300 rounded bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
        </div>
        {/* 확인/취소 버튼 */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleAnnotationConfirm}
            title="확인"
            className="p-1.5 rounded hover:bg-green-50 text-green-600"
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleAnnotationCancel}
            title="취소"
            className="p-1.5 rounded hover:bg-red-50 text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // 기본 선택 툴바 UI
  return (
    <div
      className="absolute z-50 flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-1"
      style={{ top: position.top, left: position.left }}
    >
      <button
        onClick={() => wrapSelection(ta, content, setContent, "**", "**")}
        title="굵게"
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
      >
        <Bold size={14} />
      </button>
      <button
        onClick={() => wrapSelection(ta, content, setContent, "^^", "^^")}
        title="밑줄"
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
      >
        <Underline size={14} />
      </button>
      <button
        onClick={handleAnnotationClick}
        title="꼬마글씨"
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 flex items-center gap-0.5 text-xs font-medium text-gray-600"
      >
        <Type size={14} />
        <span className="text-[10px]">꼬마</span>
      </button>
      <button
        onClick={() => wrapSelection(ta, content, setContent, "[", "]")}
        title="핵심요약"
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 flex items-center gap-0.5 text-xs font-medium text-gray-600"
      >
        <span className="text-[11px] font-bold">[ ]</span>
        <span className="text-[10px]">요약</span>
      </button>
    </div>
  );
}
