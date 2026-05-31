import { useState, useEffect, useCallback, type RefObject } from "react";
import { Bold, Underline, Type } from "lucide-react";

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

  if (!visible) return null;

  const ta = textareaRef.current;
  if (!ta) return null;

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
        onClick={() => wrapSelection(ta, content, setContent, "{{", "|설명}}")}
        title="꼬마글씨"
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 flex items-center gap-0.5 text-xs font-medium text-gray-600"
      >
        <Type size={14} />
        <span className="text-[10px]">꼬마</span>
      </button>
    </div>
  );
}
