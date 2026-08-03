# DOCX Editor

사내 문서 양식(헤딩 시작 기호·박스·형광펜·꼬마글씨·핵심요약 등)을 적용한 **보고서 작성·저장·DOCX 내보내기** 웹 서비스.
Google 로그인 기반 계정별 보고서 관리. FE(Vite+React+TipTap) + 단일 Cloudflare Worker(Hono+D1).

구조·저장 포맷·인증 흐름 등 상세 문서는 `CLAUDE.md` 참고.

## 구성

- `src/` — FE(Vite+React). Login / ReportList / ReportEditor(편집 가능 TipTap 미리보기 + 옵션 패널).
- `shared/` — FE·BE 공용 순수 TS(타입 + 기호/카운터 로직). `@shared/*` 로 임포트.
- `worker/` — 단일 Hono Worker. `/auth/*`(구글 로그인) + `/api/reports/*` + `/api/templates/*` + DOCX 생성. D1 `docs`.
- `functions/auth/` — Cloudflare Pages OAuth shim 2종(prod same-origin 리다이렉트용).

## 로컬 실행

```bash
# 1. FE 의존성
npm install --legacy-peer-deps   # TipTap peer skew 로 인해 legacy-peer-deps 필요

# 2. BE 의존성
cd worker && npm install

# 3. D1/KV 생성 → worker/wrangler.toml 의 REPLACE_WITH_* 를 실제 id 로 교체
npx wrangler d1 create docs
npx wrangler kv:namespace create CONFIG_KV

# 4. 마이그레이션 적용
npm run db:apply:local        # = wrangler d1 migrations apply docs --local

# 5. 로컬 시크릿
cp .dev.vars.example .dev.vars   # JWT_SECRET, GOOGLE_CLIENT_SECRET 입력
cd ..

# 6. 실행 (BE: 8787, FE: 5173)
cd worker && npm run dev     # 터미널 A
cd .. && npm run dev         # 터미널 B   (또는 루트에서 npm run dev:all)
```

Google Console → Authorized redirect URIs 에 `http://localhost:8787/auth/google/callback` 추가(dev, Worker 직접 라우트).

## 환경 변수

- FE: `.env` 의 `VITE_API_URL`(기본 `http://localhost:8787`).
- BE: `worker/wrangler.toml` `[vars]`(`WEB_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_ALLOWED_DOMAINS`) + 시크릿 `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`(`wrangler secret put`).

## 배포

- BE: `cd worker && npm run deploy`(`wrangler deploy`). `db:apply:remote` 로 원격 D1 마이그레이션.
- FE: Cloudflare Pages 에 `dist/` 배포. prod Pages 환경변수 `AUTH_API_URL` = Worker URL. redirect URI 에 `https://<pages-domain>/auth/google/callback` 추가.

## 주요 결정

- **저장 포맷**: TipTap JSON(정규, 속성은 marks) + 마크다운 미러(`content_md`). HTML/마크다운이 아닌 JSON 이 소스.
- **DOCX 생성**: BE에서 저장된 JSON+템플릿 스냅샷으로 DOM-free 생성(`Packer.toBlob`).
- **미리보기 기호**: 비영속 ProseMirror `Decoration` → `getJSON()` 은 항상 깨끗함, BE 출력과 동일 로직.
