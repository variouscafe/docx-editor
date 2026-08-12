# DOCX Editor Project

## Overview
사내 문서 양식(헤딩 시작 기호·박스·형광펜·꼬마글씨·핵심요약 등)을 적용한 **보고서 작성·저장·DOCX 내보내기** 웹 서비스.
Google 로그인 기반 계정별 보고서 관리. FE(Vite+React+TipTap) + 단일 Cloudflare Worker(Hono+D1) 구조.

## Architecture
```
docx-editor/
├── src/              FE (Vite+React). Login / ReportList / ReportEditor(편집 가능 TipTap 미리보기 + 옵션).
├── shared/           순수 TS(타입+로직, 0 의존성). FE·BE 공용. @shared/* 로 임포트.
│                     lineStartSymbol, options, symbols(기호/카운터/선행공백), runs(RunData/JSONContent), presets, report.
├── worker/           단일 Hono Worker(데이터 전용). /api/reports/* + /api/templates/*.
│   ├── src/{index,env,types}.ts, routes/{reports,templates}.ts, docx/generator.ts,
│   │   middleware/auth.ts(JWT 검증), crypto/{base64,jwt}.ts, db/{schema,index}.ts
│   ├── wrangler.toml (D1 name=docs, nodejs_compat) — KV/GOOGLE 없음(인증은 공용 suseona-auth 위임)
│   └── migrations/{0000_init,0001_shared_auth}.sql
└── functions/auth/   Cloudflare Pages OAuth shim 2종 → 공용 suseona-auth 의 /auth/google/exchange 호출.
```
- FE·BE 모두 `shared/` 의 순수 로직(기호 해석·옵션 타입)을 공유 → **미리보기 장식과 DOCX 출력이 동일 로직**으로 구동.

## Auth (공용 suseona-auth 공유)
- 구글 로그인/JWT 발급/유저 저장은 **공용 `suseona-auth` Worker(`https://suseona-api.suseona.com`)** 가 담당. suseona.com · docs.suseona.com · 모든 서브도메인이 같은 인증 사용.
- Login 버튼 → `/auth/google`(각 도메인의 Pages Function) → 구글 동의 → `/auth/google/callback` → Pages Function이 suseona-auth `/auth/google/exchange` 로 코드 교환 → 토큰을 fragment(`#at=&rt=`)로 **해당 도메인** 루트로 복귀 → `main.tsx`가 렌더 전 소비(zustand persist). (origin-aware: 어디서 로그인하든 그 도메인으로 돌아옴)
- **docx-editor-api 는 JWT 발급 안 함** — suseona-auth 가 발급한 HS256 JWT를 같은 `JWT_SECRET`로 검증만 수행(`middleware/auth.ts`). user_id는 JWT.sub(suseona-auth 유저 UUID).
- FE: `authHttp`(데이터, `API_URL`) + `authWorkerHttp`(인증, `AUTH_API_URL`) 분리. Bearer + 401→refresh→retry(갱신도 suseona-auth `/auth/refresh`).

## Persistence (저장 구조)
- **정규 포맷 = TipTap JSON(ProseMirror doc)**. 굵게/이탤릭/밑줄/형광펜(color)/박스(solid/dashed)/꼬마글씨(annotation)/핵심요약/폰트사이즈 등 **포맷 속성은 JSON 안의 marks+attrs**로 손실없이 저장. 에디터가 `getJSON()`/`setContent(json)`으로 직접 생산·소비(tiptapJson 생성 위치 문제는 소멸).
- `reports.content_md`: FE가 저장 시 산출하는 best-effort **마크다운 미러**(검색/AI/이식용). JSON이 소스 오브 트루스.
- `reports.template_options`: 저장 시점 `DocxOptions` **스냅샷** → 템플릿 변경에도 문서 모양 고정.
- D1 `docs` 테이블: `reports`, `templates` (인증은 공용 suseona-auth 이므로 users/refresh_sessions 없음; `user_id`는 plain text = JWT.sub). 마이그레이션 `worker/migrations/0001_shared_auth.sql`.
- FE 수정은 debounce 자동저장(1.5s)+수동 저장으로 `PATCH /api/reports/:id` 갱신.

## DOCX Export (서버사이드)
- BE(`worker/src/docx/generator.ts`)가 저장된 `content`(JSON)+`template_options`(스냅샷)을 소비해 **DOM-free**로 `.docx` 생성(`docx` 패키지, `Packer.toBlob`). `POST /api/reports/:id/export`가 Blob 반환.
- 기호/카운터/선행공백·꼬마글씨(TextBox/○문단)·핵심요약(1×3 표)·박스 보더·형광펜 셰이딩·폰트사이즈(half-point) 등 모두 포팅.
- FE 미리보기는 비영속 ProseMirror `Decoration`으로 기호/괄호를 렌더(`getJSON()`은 항상 깨끗함).

## Local Run
1. 마이그레이션: `cd worker && npm run db:apply:local` (D1 `docs`).
2. 시크릿: `cp worker/.dev.vars.example worker/.dev.vars` 후 `JWT_SECRET`(= 공용 suseona-auth 의 값과 동일) 입력.
3. BE: `cd worker && npm run dev` (8787). FE 콘텐츠 편집만 볼 땐 `npm run dev` (5173).
4. **로컬 로그인**은 Pages Function이 필요하므로 `wrangler pages dev`(functions/ 실행, exchange→suseona-auth). plain vite 에선 로그인 불가(콘텐츠 편집만).
5. Google Console authorized redirect URI: 각 도메인의 `/auth/google/callback`(예: `https://docs.suseona.com/auth/google/callback`).

## Deploy
- BE: `cd worker && npm run deploy`. **필수**: docx-editor-api 의 `JWT_SECRET`를 suseona-auth 와 **동일값**으로 `npx wrangler secret put JWT_SECRET`.
- FE: `VITE_API_URL`(docx-editor-api) + `VITE_AUTH_API_URL`(suseona-auth) 주입해 빌드 후 Cloudflare Pages 배치. Pages Function은 코드상 기본값이 suseona-auth(`functions/auth/google/callback.js`).


## Requirements

### Editor (ReportEditor — 편집 가능 TipTap 미리보기)
- 좌측 마크다운 textarea 패널은 제거됨. 편집은 중앙 **편집 가능 TipTap 미리보기**에서 직접 수행.
- RichTextToolbar: 헤딩/제목 전환, 굵게/이탤릭/밑줄, **폰트사이즈**(fontSize mark), 정렬, 리스트, 박스(solid/dashed), 핵심요약, 꼬마글씨, 형광펜(5색).
- 커스텀 마크다운 문법(`++box++`, `~~dashed~~`, `==highlight==`, `^^underline^^`, `{{text|annotation}}`, `[core summary]`)은 가져오기/내보내기용. 저장 포맷은 JSON(마크다운은 content_md 미러). `src/utils/markdownToHtml.ts`(md→HTML), `src/utils/jsonToMarkdown.ts`(JSON→md 미러) 참고.
- 라인 시작 기호·카운터·괄호·꼬마글씨2 문단은 비영속 **Decoration**으로 표시(편집 내용에 섞이지 않음).

### Center Panel - DOCX Preview
- Preview matches left panel editor content
- A4 layout (210x297mm) with margins, looks like Word DOCX view
- Word wrapping without cutting words (explicit line breaks)
- All formatting (paragraph spacing, fonts, line breaks) exported to DOCX
- A4 페이지네이션: 자체 `MeasurePagination`(float 폐지, 최상위 블록 offsetHeight 측정 → 원자적 배치). tiptap-pagination-plus(float 기반, 표 BFC 충돌로 찌그러짐/빈 페이지 버그) 대체. **표는 행 단위로 페이지 분할 + 헤더 반복**(워드-like). 장식은 비영속 Decoration.widget → getJSON()/저장/DOCX 내보내기 영향 없음.

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
  | `CONTENT_BRACKET` | `【내용】` | X | 【내용】 (고정) |
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

### 핵심요약 (Core Summary)
문서에서 중요 내용을 `[ 내용 ]` 형태로 강조 표시하는 문서 작성법.

#### 마크다운 문법
- `[핵심요약 내용]` 형태로 작성 (대괄호 안에 내용)
- 예: `[본 계약은 2026년 1월 1일부터 효력이 발생한다]`

#### 워드 문서 규칙
- 1행 3열(3개 셀) 표로 렌더링
- 왼쪽 셀: 매우 좁음, 테두리 표시 (왼쪽/위/아래) → `[` 역할
- 가운데 셀: 내용, **모든 테두리 투명** → 본문 영역
- 오른쪽 셀: 매우 좁음, 테두리 표시 (오른쪽/위/아래) → `]` 역할
- 결과적으로 워드에서 `[ 내용 ]` 형태로 보임 (두 줄 이상 가능)

#### 미리보기
- CSS로 `[ 내용 ]` 형태 표시

### DOCX Export
- All preview formatting must be exported to DOCX (XML generation required)
- Boxes, highlights, fonts, spacing, line breaks all preserved
- 꼬마글씨1: TextBox로 export
- 꼬마글씨2: 별도 단락으로 export

## Tech Stack
- **FE**: Vite + React + TypeScript, Tailwind CSS, TipTap(editor), react-router-dom, zustand(auth), lucide-react, marked(md 가져오기), 자체 MeasurePagination(A4 페이지네이션 — tiptap-pagination-plus 를 float 폐지·DOM 측정 기반 원자적 배치로 대체, `src/components/Editor/extensions/measurePagination.ts`)
- **BE**: Cloudflare Worker + Hono, drizzle-orm(D1), zod, docx.js(서버사이드 DOCX 생성, DOM-free)
- **Infra**: Cloudflare D1(`docs`), KV(JWKS 캐시), Pages(FE + OAuth shim)
- 저장 포맷: TipTap JSON(정규) + 마크다운 미러. 다운로드는 네이티브 anchor(URL.createObjectURL) — file-saver 미사용.
