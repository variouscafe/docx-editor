/**
 * 이미지 조회 라우터 — 인증 없음(인덱스에서 public 라우터와 같은 방식으로 마운트).
 * <img src> 는 Bearer 헤더를 실을 수 없고 퍼블릭 공유 보기(PublicReportView)도 로그인 없이
 * 렌더하므로, 업로드 시 발급한 UUID 자체를 capability 로 사용(shareToken 과 동일 신뢰 모델).
 * 읽기는 R2만 수행(D1 조회 없음) — 같은 id 는 항상 같은 바이트 → immutable 캐시.
 */
import { Hono } from 'hono';
import { notFound } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const imageRoutes = new Hono<AppEnv>();

imageRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) throw notFound('Image not found');
  const obj = await c.env.IMAGES.get(`uploads/${id}`);
  if (!obj) throw notFound('Image not found');

  const headers: Record<string, string> = {
    'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: obj.httpEtag,
  };
  if (c.req.header('if-none-match') === obj.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
});
