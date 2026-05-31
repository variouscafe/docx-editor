import { type RefObject } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Square,
  Highlighter,
} from "lucide-react";
import { highlightColors } from "./extensions/highlightColors";

interface EditorToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  setContent: (v: string) => void;
}

/** Get the current line's heading level (0 = paragraph) */
function getCurrentHeadingLevel(text: string, pos: number): number {
  const before = text.substring(0, pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = text.substring(lineStart, pos);
  const match = /^(#{1,6})\s/.exec(line);
  return match ? match[1].length : 0;
}

/** Replace or set the heading prefix on the current line */
function setLinePrefix(
  textarea: HTMLTextAreaElement,
  content: string,
  setContent: (v: string) => void,
  prefix: string,
) {
  const { selectionStart, selectionEnd } = textarea;
  const before = content.substring(0, selectionStart);
  const after = content.substring(selectionEnd);

  // Find line boundaries
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = after.indexOf("\n");
  const lineAfter = lineEnd === -1 ? after : after.substring(0, lineEnd);
  const fullLine = content.substring(lineStart, lineStart + before.length - lineStart + lineAfter.length);

  // Remove existing heading prefix
  const strippedLine = fullLine.replace(/^#{1,6}\s/, "");

  const newLine = prefix ? `${prefix} ${strippedLine}` : strippedLine;
  const newContent =
    content.substring(0, lineStart) + newLine + content.substring(lineStart + fullLine.length);

  setContent(newContent);

  // Restore cursor position after React re-render
  requestAnimationFrame(() => {
    const offset = newLine.length - fullLine.length;
    textarea.selectionStart = selectionStart + offset;
    textarea.selectionEnd = selectionEnd + offset;
    textarea.focus();
  });
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
  const hasSelection = selectionStart !== selectionEnd;

  if (hasSelection) {
    // Check if already wrapped — toggle off
    const beforeText = content.substring(selectionStart - before.length, selectionStart);
    const afterText = content.substring(selectionEnd, selectionEnd + after.length);
    if (beforeText === before && afterText === after) {
      // Unwrap
      const newContent =
        content.substring(0, selectionStart - before.length) +
        selected +
        content.substring(selectionEnd + after.length);
      setContent(newContent);
      requestAnimationFrame(() => {
        textarea.selectionStart = selectionStart - before.length;
        textarea.selectionEnd = selectionEnd - before.length;
        textarea.focus();
      });
      return;
    }

    // Wrap
    const newContent =
      content.substring(0, selectionStart) + before + selected + after + content.substring(selectionEnd);
    setContent(newContent);
    requestAnimationFrame(() => {
      textarea.selectionStart = selectionStart + before.length;
      textarea.selectionEnd = selectionEnd + before.length;
      textarea.focus();
    });
  } else {
    // No selection — insert markers with cursor between them
    const newContent =
      content.substring(0, selectionStart) + before + after + content.substring(selectionStart);
    setContent(newContent);
    requestAnimationFrame(() => {
      textarea.selectionStart = selectionStart + before.length;
      textarea.selectionEnd = selectionStart + before.length;
      textarea.focus();
    });
  }
}

/** Insert text at the start of the current line */
function insertAtLineStart(
  textarea: HTMLTextAreaElement,
  content: string,
  setContent: (v: string) => void,
  text: string,
) {
  const { selectionStart, selectionEnd } = textarea;
  const before = content.substring(0, selectionStart);
  const lineStart = before.lastIndexOf("\n") + 1;
  const newContent = content.substring(0, lineStart) + text + content.substring(lineStart);
  setContent(newContent);
  requestAnimationFrame(() => {
    textarea.selectionStart = selectionStart + text.length;
    textarea.selectionEnd = selectionEnd + text.length;
    textarea.focus();
  });
}

export default function EditorToolbar({ textareaRef, content, setContent }: EditorToolbarProps) {
  if (!textareaRef.current) return null;

  const headingValue = getCurrentHeadingLevel(content, textareaRef.current.selectionStart);

  const ta = textareaRef.current;

  const tools = [
    {
      icon: <Bold size={16} />,
      action: () => wrapSelection(ta, content, setContent, "**", "**"),
      title: "Bold",
    },
    {
      icon: <Italic size={16} />,
      action: () => wrapSelection(ta, content, setContent, "*", "*"),
      title: "Italic",
    },
    {
      icon: <Underline size={16} />,
      action: () => wrapSelection(ta, content, setContent, "^^", "^^"),
      title: "Underline",
    },
    { divider: true },
    {
      icon: <AlignLeft size={16} />,
      action: () => insertAtLineStart(ta, content, setContent, ""),
      title: "Align Left",
    },
    {
      icon: <AlignCenter size={16} />,
      action: () => insertAtLineStart(ta, content, setContent, ""),
      title: "Align Center",
    },
    {
      icon: <AlignRight size={16} />,
      action: () => insertAtLineStart(ta, content, setContent, ""),
      title: "Align Right",
    },
    { divider: true },
    {
      icon: <List size={16} />,
      action: () => insertAtLineStart(ta, content, setContent, "- "),
      title: "Bullet List",
    },
    {
      icon: <ListOrdered size={16} />,
      action: () => insertAtLineStart(ta, content, setContent, "1. "),
      title: "Ordered List",
    },
    { divider: true },
    {
      icon: <Square size={16} />,
      action: () => wrapSelection(ta, content, setContent, "++", "++"),
      title: "Solid Box",
      variant: "solid" as const,
    },
    {
      icon: <Square size={16} />,
      action: () => wrapSelection(ta, content, setContent, "~~", "~~"),
      title: "Dashed Box",
      variant: "dashed" as const,
    },
    { divider: true },
  ];

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white flex-wrap">
      {/* Heading select */}
      <select
        className="h-8 px-2 text-sm border border-gray-300 rounded bg-white"
        value={headingValue === 0 ? "paragraph" : String(headingValue)}
        onChange={(e) => {
          const level = e.target.value;
          if (level === "paragraph") {
            setLinePrefix(ta, content, setContent, "");
          } else {
            setLinePrefix(ta, content, setContent, "#".repeat(Number(level)));
          }
        }}
      >
        <option value="paragraph">Paragraph</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
        <option value="5">Heading 5</option>
        <option value="6">Heading 6</option>
      </select>

      {tools.map((tool, i) => {
        if ("divider" in tool) {
          return <div key={i} className="w-px h-6 bg-gray-300 mx-1" />;
        }
        return (
          <button
            key={i}
            onClick={tool.action}
            title={tool.title}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600"
            style={
              tool.variant === "dashed"
                ? { border: "1.5px dashed currentColor", borderRadius: 2 }
                : undefined
            }
          >
            {tool.icon}
          </button>
        );
      })}

      {/* Highlight color buttons */}
      <div className="flex items-center gap-0.5">
        <Highlighter size={16} className="text-gray-500 mr-1" />
        {highlightColors.map((hc) => (
          <button
            key={hc.color}
            onClick={() =>
              wrapSelection(ta, content, setContent, `==`, `=={${hc.color}}`)
            }
            title={hc.name}
            className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
            style={{ backgroundColor: hc.color }}
          />
        ))}
      </div>
    </div>
  );
}
