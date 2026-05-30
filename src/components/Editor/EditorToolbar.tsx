import { Editor } from "@tiptap/react";
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
  editor: Editor | null;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  const tools = [
    {
      icon: <Bold size={16} />,
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive("bold"),
      title: "Bold",
    },
    {
      icon: <Italic size={16} />,
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive("italic"),
      title: "Italic",
    },
    {
      icon: <Underline size={16} />,
      action: () => editor.chain().focus().toggleUnderline().run(),
      active: editor.isActive("underline"),
      title: "Underline",
    },
    { divider: true },
    {
      icon: <AlignLeft size={16} />,
      action: () => editor.chain().focus().setTextAlign("left").run(),
      active: editor.isActive({ textAlign: "left" }),
      title: "Align Left",
    },
    {
      icon: <AlignCenter size={16} />,
      action: () => editor.chain().focus().setTextAlign("center").run(),
      active: editor.isActive({ textAlign: "center" }),
      title: "Align Center",
    },
    {
      icon: <AlignRight size={16} />,
      action: () => editor.chain().focus().setTextAlign("right").run(),
      active: editor.isActive({ textAlign: "right" }),
      title: "Align Right",
    },
    { divider: true },
    {
      icon: <List size={16} />,
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive("bulletList"),
      title: "Bullet List",
    },
    {
      icon: <ListOrdered size={16} />,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive("orderedList"),
      title: "Ordered List",
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
      active: editor.isActive("boxBorder") && editor.getAttributes("boxBorder")["data-border"] === "solid",
      title: "Solid Box",
      variant: "solid" as const,
    },
    {
      icon: <Square size={16} />,
      action: () => editor.chain().focus().setDashedBox().run(),
      active: editor.isActive("boxBorder") && editor.getAttributes("boxBorder")["data-border"] === "dashed",
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
        value={getCurrentHeading(editor)}
        onChange={(e) => {
          const level = e.target.value;
          if (level === "paragraph") {
            editor.chain().focus().setParagraph().run();
          } else {
            editor
              .chain()
              .focus()
              .toggleHeading({ level: Number(level) as 1 | 2 | 3 | 4 | 5 | 6 })
              .run();
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
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
              tool.active ? "bg-gray-200 text-blue-600" : "text-gray-600"
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
    </div>
  );
}

function getCurrentHeading(editor: Editor): string {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive("heading", { level })) return String(level);
  }
  return "paragraph";
}
