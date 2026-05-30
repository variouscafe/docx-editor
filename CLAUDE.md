# DOCX Editor Project

## Overview
React-based web service supporting DOCX preview and export with TipTap markdown editor.

## Requirements

### Left Panel - TipTap Editor
- TipTap-based markdown editor with text toolbar at the top
- Select text to apply solid box or dashed box borders (visible in preview)
- Highlighter/fluorescent pen effect on text (visible in preview)
- HTML applied but HTML source code NOT visible in editor

### Center Panel - DOCX Preview
- Preview matches left panel editor content
- A4 layout (210x297mm) with margins, looks like Word DOCX view
- Word wrapping without cutting words (explicit line breaks)
- All formatting (paragraph spacing, fonts, line breaks) exported to DOCX

### Right Panel - Options JSON
- Editable JSON showing current preview options
- Changes reflected in preview in real-time

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
- 자동 카운터 기호는 H1~H4 모든 헤딩에서 각각 독립적으로 자동 증가

### Formatting Options
- **Common (default)**: font 14pt, paragraph spacing 12pt
- **# (H1)**: paragraph spacing 24pt, font 24pt, line start symbol configurable (1., 1), etc.)
- **## (H2)**: paragraph spacing 16pt, line start symbol: □, leading space: 1
- **### (H3)**: line start symbol: -, leading space: 4
- **#### (H4)**: line start symbol: •, leading space: 4, second line onwards: paragraph spacing 16pt, single line: paragraph spacing 16pt

### DOCX Export
- All preview formatting must be exported to DOCX (XML generation required)
- Boxes, highlights, fonts, spacing, line breaks all preserved

## Tech Stack
- Vite + React + TypeScript
- Tailwind CSS
- TipTap (editor)
- docx.js (DOCX generation)
- file-saver (download)
- lucide-react (icons)
