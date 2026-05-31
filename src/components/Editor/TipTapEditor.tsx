import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { BoxBorder } from "./extensions/boxBorder";
import { HighlightExtension } from "./extensions/highlightColors";
import { MarkdownPaste } from "./extensions/markdownPaste";
import EditorToolbar from "./EditorToolbar";
import HeadingBubbleMenu from "./HeadingBubbleMenu";
import type { DocxOptions } from "../../types/options";

interface TipTapEditorProps {
  onContentChange: (html: string) => void;
  options: DocxOptions;
}

export default function TipTapEditor({ onContentChange, options }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      BoxBorder,
      HighlightExtension,
      MarkdownPaste,
    ],
    content: `
<h1>DOCX Editor</h1>
<p>이 에디터에서 문서를 작성하세요. 텍스트를 선택하여 <span data-border="solid">네모 박스</span>나 <span data-border="dashed">점선 박스</span>를 적용할 수 있습니다.</p>
<h2>형광펜 효과</h2>
<p>텍스트에 <mark data-color="#fef08a">형광펜</mark>을 적용할 수 있습니다.</p>
<h3>세 번째 제목</h3>
<p>일반 텍스트 내용입니다.</p>
<h4>네 번째 제목</h4>
<p>또 다른 내용입니다.</p>
<h5>다섯 번째 제목</h5>
<p>H5 헤딩 내용입니다.</p>
<h6>여섯 번째 제목</h6>
<p>H6 헤딩 내용입니다.</p>
`,
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
    onCreate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
  });

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
        {editor && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 100 }}
            shouldShow={({ state }) => {
              // Show on both text selection (drag) and cursor placement (click)
              return state.selection.from > 0;
            }}
          >
            <HeadingBubbleMenu editor={editor} options={options} />
          </BubbleMenu>
        )}
      </div>
    </div>
  );
}
