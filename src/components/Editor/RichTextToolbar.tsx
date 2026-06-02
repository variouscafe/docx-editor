"use client";
import { useState } from "react";
import type { Editor } from "@tiptap/react";
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
  X,
  Check,
} from "lucide-react";
import { highlightColors } from "./extensions/highlightColors";

interface RichTextToolbarProps {
  editor: Editor | null;
}

export default function RichTextToolbar({ editor }: RichTextToolbarProps) {
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationText, setAnnotationText] = useState("");

  if (!editor) return null;

  const handleAnnotationConfirm = () => {
    if (annotationText.trim()) {
      editor.chain().focus().setAnnotation(annotationText.trim()).run();
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
      icon: <Bold size={16} />,
      action: () => editor.chain().focus().toggleBold().run(),
      title: "Bold",
      active: editor.isActive("bold"),
    },
    {
      icon: <Italic size={16} />,
      action: () => editor.chain().focus().toggleItalic().run(),
      title: "Italic",
      active: editor.isActive("italic"),
    },
    {
      icon: <Underline size={16} />,
      action: () => editor.chain().focus().toggleUnderline().run(),
      title: "Underline",
      active: editor.isActive("underline"),
    },
    { divider: true },
    {
      icon: <AlignLeft size={16} />,
      action: () => editor.chain().focus().setTextAlign("left").run(),
      title: "Align Left",
      active: editor.isActive({ textAlign: "left" }),
    },
    {
      icon: <AlignCenter size={16} />,
      action: () => editor.chain().focus().setTextAlign("center").run(),
      title: "Align Center",
      active: editor.isActive({ textAlign: "center" }),
    },
    {
      icon: <AlignRight size={16} />,
      action: () => editor.chain().focus().setTextAlign("right").run(),
      title: "Align Right",
      active: editor.isActive({ textAlign: "right" }),
    },
    { divider: true },
    {
      icon: <List size={16} />,
      action: () => editor.chain().focus().toggleBulletList().run(),
      title: "Bullet List",
      active: editor.isActive("bulletList"),
    },
    {
      icon: <ListOrdered size={16} />,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      title: "Ordered List",
      active: editor.isActive("orderedList"),
    },
    { divider: true },
    {
      icon: <Square size={16} />,
      action: () => {
        if (editor.isActive("boxBorder")) {
          editor.chain().focus().unsetBox().run();
        } else {
          editor.chain().focus().setSolidBox().run();
        }
      },
      title: "Solid Box",
      active: editor.isActive("boxBorder"),
    },
    {
      icon: <Square size={16} />,
      action: () => {
        if (editor.isActive("boxBorder")) {
          editor.chain().focus().unsetBox().run();
        } else {
          editor.chain().focus().setDashedBox().run();
        }
      },
      title: "Dashed Box",
      variant: "dashed" as const,
      active: editor.isActive("boxBorder"),
    },
    {
      icon: <span className="text-xs font-bold">[ ]</span>,
      action: () => editor.chain().focus().toggleMark("coreSummary").run(),
      title: "핵심요약",
      active: editor.isActive("coreSummary"),
    },
    { divider: true },
    {
      icon: (
        <span className="text-xs font-bold text-blue-600" title="꼬마글씨">
          주
        </span>
      ),
      action: () => {
        if (editor.isActive("annotation")) {
          editor.chain().focus().unsetAnnotation().run();
        } else {
          setAnnotationMode(true);
        }
      },
      title: "꼬마글씨",
      active: editor.isActive("annotation"),
    },
  ];

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white flex-wrap">
      {/* Heading select */}
      <select
        className="h-8 px-2 text-sm border border-gray-300 rounded bg-white"
        value={
          editor.isActive("title")
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
                        : "paragraph"
        }
        onChange={(e) => {
          const level = e.target.value;
          if (level === "paragraph") {
            editor.chain().focus().setParagraph().run();
          } else if (level === "title") {
            editor.chain().focus().setNode("title").run();
          } else {
            editor
              .chain()
              .focus()
              .toggleHeading({ level: Number(level) as 1 | 2 | 3 | 4 | 5 | 6 })
              .run();
          }
        }}
      >
        <option value="title">제목</option>
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
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
              tool.active ? "bg-gray-200 text-gray-900" : "text-gray-600"
            }`}
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
              editor.chain().focus().toggleHighlight({ color: hc.color }).run()
            }
            title={hc.name}
            className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
            style={{ backgroundColor: hc.color }}
          />
        ))}
      </div>

      {/* Annotation input popup */}
      {annotationMode && (
        <div className="flex items-center gap-1 ml-2 border border-gray-300 rounded px-2 py-1 bg-white shadow-sm">
          <input
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAnnotationConfirm();
              if (e.key === "Escape") handleAnnotationCancel();
            }}
            placeholder="부연설명 입력..."
            className="w-32 text-sm outline-none border-none"
            autoFocus
          />
          <button
            onClick={handleAnnotationConfirm}
            className="p-0.5 text-green-600 hover:text-green-800"
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleAnnotationCancel}
            className="p-0.5 text-red-500 hover:text-red-700"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
