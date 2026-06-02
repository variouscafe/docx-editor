import { useRef, useCallback } from "react";
import EditorToolbar from "./EditorToolbar";
import SelectionToolbar from "./SelectionToolbar";
import type { DocxOptions } from "../../types/options";

interface TipTapEditorProps {
  value: string;
  onChange: (md: string) => void;
  options: DocxOptions;
}

export const INITIAL_MARKDOWN = `# DOCX Editor

이 에디터에서 문서를 작성하세요. 텍스트를 선택하여 ++네모 박스++나 ~~점선 박스~~를 적용할 수 있습니다.

## 형광펜 효과

텍스트에 ==형광펜==을 적용할 수 있습니다.

[이 문서는 DOCX 편집기 사용법을 설명합니다. 핵심요약 내용은 대괄호 안에 작성하세요.]

### 세 번째 제목

일반 텍스트 내용입니다.

#### 네 번째 제목

또 다른 내용입니다.

| 항목 | 내용 | 비고 |
| --- | --- | --- |
| 항목 1 | 내용 1 | 비고 1 |
| 항목 2 | 내용 2 | 비고 2 |
| 항목 3 | 내용 3 | 비고 3 |

##### 다섯 번째 제목

H5 헤딩 내용입니다.

###### 여섯 번째 제목

H6 헤딩 내용입니다.
`;

export default function TipTapEditor({ value, onChange }: TipTapEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  /** Toolbar-driven content update */
  const setContentFromToolbar = useCallback(
    (newContent: string) => {
      onChange(newContent);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      <EditorToolbar
        textareaRef={textareaRef}
        content={value}
        setContent={setContentFromToolbar}
      />
      <div className="flex-1 overflow-y-auto relative">
        <SelectionToolbar
          textareaRef={textareaRef}
          content={value}
          setContent={setContentFromToolbar}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          className="w-full h-full resize-none p-4 font-mono text-sm leading-relaxed text-gray-900 outline-none border-none"
          spellCheck={false}
          placeholder="마크다운을 입력하세요..."
        />
      </div>
    </div>
  );
}
