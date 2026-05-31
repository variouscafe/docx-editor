import type { Editor } from "@tiptap/react";
import type { DocxOptions } from "../../types/options";
import { getSymbolDisplay } from "../../types/lineStartSymbol";

interface HeadingBubbleMenuProps {
  editor: Editor;
  options: DocxOptions;
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export default function HeadingBubbleMenu({
  editor,
  options,
}: HeadingBubbleMenuProps) {
  const getSymbol = (level: number): string => {
    const key = `h${level}` as keyof Pick<
      DocxOptions,
      "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
    >;
    return getSymbolDisplay(options[key].lineStartSymbol);
  };

  const isActive = (level: number): boolean => {
    return editor.isActive("heading", { level });
  };

  const applyHeading = (level: number) => {
    editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  };

  return (
    <div className="flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-1">
      {HEADING_LEVELS.map((level) => (
        <button
          key={level}
          onClick={() => applyHeading(level)}
          className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            isActive(level)
              ? "bg-blue-500 text-white"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          H{level} {getSymbol(level)}
        </button>
      ))}
    </div>
  );
}
