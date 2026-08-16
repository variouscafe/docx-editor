/** Cloudflare Worker bindings for docx-editor-api (데이터 전용). */
export interface Bindings {
  /** D1 — reports, templates. */
  DB: D1Database;
  /** R2 — 보고서 삽입용 업로드 이미지(key: uploads/{uuid}). */
  IMAGES: R2Bucket;
  /** HS256 JWT 검증 비밀키. 공용 suseona-auth 의 JWT_SECRET 와 동일해야 함(같은 토큰 검증). */
  JWT_SECRET: string;
}

/** 인증 유저 컨텍스트(jwtAuth 가 JWT 에서 추출해 부착). */
export interface UserContext {
  userId: string;
  email: string;
  name: string | null;
}
