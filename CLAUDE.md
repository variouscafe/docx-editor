# DOCX Editor Project

## Overview
React-based web service supporting DOCX preview and export with TipTap markdown editor.

## Requirements

### Left Panel - Markdown Editor
- 마크다운 텍스트 에디터 (textarea) — 원문 마크다운 문법 표시 (예: `### 텍스트 레벨 3`)
- Custom markdown syntax: `++solid box++`, `~~dashed box~~`, `==highlight==`, `^^underline^^`, `{{text|annotation}}`
- 툴바에서 마크다운 문법 삽입 (헤딩, 볼드, 이탤릭, 박스, 하이라이트 등)
- 텍스트 드래그 시 선택 도구 팝업 (굵게, 밑줄, 꼬마글씨)

### Center Panel - DOCX Preview
- Preview matches left panel editor content
- A4 layout (210x297mm) with margins, looks like Word DOCX view
- Word wrapping without cutting words (explicit line breaks)
- All formatting (paragraph spacing, fonts, line breaks) exported to DOCX

### Right Panel - Options JSON
- Editable JSON showing current preview options
- Changes reflected in preview in real-time

### Line Start Symbol Leading Space Rules
- 기호에 따른 선행 공백(leading space) 규칙 — 미리보기와 DOCX 내보내기 모두에서 항상 동일하게 적용:
  | 기호 | Enum Key | 선행 공백 |
  |------|----------|-----------|
  | `□`  | `SQUARE` | 1칸       |
  | `-`  | `DASH`   | 4칸       |
  | `•`  | `BULLET` | 4칸       |
- 어떤 헤딩 레벨(H1~H6)에서 해당 기호를 선택하든 관계없이 위 공백이 항상 강제된다.

### Line Start Symbol Enum
- 헤딩 레벨별 시작 기호를 enum에서 선택 가능
- 선택 가능한 기호 목록 (`LineStartSymbol`):
  | Enum Key | 표시 | 자동 카운터 | 예시 |
  |----------|------|------------|------|
  | `NUMBER_DOT` | `1.` | O | 1., 2., 3., ... |
  | `NUMBER_PAREN` | `1)` | O | 1), 2), 3), ... |
  | `ROMAN` | `Ⅰ` | O | Ⅰ, Ⅱ, Ⅲ, ... |
  | `CIRCLED` | `①` | O | ①, ②, ③, ... |
  | `SQUARE` | `□` | X | □ (고정) |
  | `DASH` | `-` | X | - (고정) |
  | `BULLET` | `•` | X | • (고정) |
- 좌측 패널 상단에 각 헤딩(H1~H4)별 드롭다운으로 시작 기호 선택
- 서로 다른 헤딩에 같은 시작 기호 중복 선택 불가
- 우측 JSON 패널에 선택된 enum 문자열이 설정되고 실시간 반영
- 자동 카운터 기호는 H1~H6 모든 헤딩에서 각각 독립적으로 자동 증가

### Formatting Options
- **Common (default)**: font 14pt, paragraph spacing 12pt
- **# (H1)**: paragraph spacing 24pt, font 24pt, line start symbol configurable (1., 1), etc.)
- **## (H2)**: paragraph spacing 16pt, line start symbol: □, leading space: 1
- **### (H3)**: line start symbol: -, leading space: 4
- **#### (H4)**: line start symbol: •, leading space: 4, second line onwards: paragraph spacing 16pt, single line: paragraph spacing 16pt

### 꼬마글씨 (Small Annotation Text)
사내 문서에서 본문에 부연 설명을 추가하는 문서 작성법. 꼬마글씨1과 꼬마글씨2 두 가지 모드 지원.

#### 마크다운 문법
- `{{본문|부연설명}}` 형태로 작성
- 예: `{{Claude Code|앤트로픽에서 개발한 코딩 툴}} 사용법에 대해서 설명합니다.`
- 에디터에서 텍스트 드래그 시 굵게, 밑줄, 꼬마글씨 선택 가능한 텍스트 도구 표시

#### 꼬마글씨1 (인라인 주석)
- 본문 아래에 파란색 글씨로 부연 설명 표시
- 스타일: 폰트 10pt, 바탕체(Batang), 파란색(#0000FF)
- 워드에서 별도 텍스트 박스(TextBox) 사용 — 본문 스타일에 영향 없음
- DOCX 내보내기 시 TextBox로 export

#### 꼬마글씨2 (단락 주석)
- 해당 문장이 끝난 후 다음 단락으로 별도 표시
- 당구장 기호(○)로 시작
- 스타일: 폰트 12pt, 단락 뒤 16pt

#### 표시 모드 선택
- 좌측 에디터 상단에서 꼬마글씨 표시 옵션(1, 2) 선택 가능
- 선택된 옵션에 따라 미리보기에 다르게 렌더링
- 우측 옵션 JSON에 꼬마글씨1/꼬마글씨2 설정 포함

### DOCX Export
- All preview formatting must be exported to DOCX (XML generation required)
- Boxes, highlights, fonts, spacing, line breaks all preserved
- 꼬마글씨1: TextBox로 export
- 꼬마글씨2: 별도 단락으로 export

## Tech Stack
- Vite + React + TypeScript
- Tailwind CSS
- TipTap (editor)
- docx.js (DOCX generation)
- file-saver (download)
- lucide-react (icons)
- marked (markdown parsing)
