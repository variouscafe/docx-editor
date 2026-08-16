/**
 * 업로드 라우터 — 보고서 삽입용 이미지 업로드(jwtAuth).
 * 바이너리는 R2 `uploads/{id}` 에 저장하고 D1 uploads 행은 소유권/용량 audit 용
 * (조회·export 는 R2만 읽음). DOCX ImageRun 이 지원하는 jpg/png/gif 로 제한 —
 * webp/heic/초대형 이미지는 FE에서 canvas 재인코딩 후 업로드(src/utils/imageFile.ts).
 */
import { Hono } from 'hono';
import { createDb } from '../db/index.js';
import { uploads } from '../db/schema.js';
import { badRequest, payloadTooLarge } from '../lib/errors.js';
import { newId } from '../lib/id.js';
import { jwtAuth } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

const MAX_BYTES = 10 * 1024 * 1024;

/** 매직바이트 스니프 — 선언 content-type 이 아닌 실제 바이트로 판별(변조 방지). */
function sniffImage(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 6) {
    const head = String.fromCharCode(...bytes.slice(0, 6));
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  return null;
}

/** 폼필드 치수 클램프 — 클라이언트 실측값, 레이아웃 용도(1~10000px). */
function parseDim(v: string | File | undefined): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : null;
}

export const uploadRoutes = new Hono<AppEnv>();
uploadRoutes.use('*', jwtAuth);

uploadRoutes.post('/', async (c) => {
  const userId = c.get('user').userId;
  if (!(c.req.header('content-type') ?? '').startsWith('multipart/form-data')) {
    throw badRequest('Expected multipart/form-data');
  }
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) throw badRequest('Missing file field');
  if (file.size > MAX_BYTES) throw payloadTooLarge('Image exceeds 10MB limit');

  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf));
  if (!mime) throw badRequest('Unsupported image type (png/jpeg/gif only)');
  const width = parseDim(body['width']);
  const height = parseDim(body['height']);

  const id = newId();
  const r2Key = `uploads/${id}`;
  await c.env.IMAGES.put(r2Key, buf, {
    httpMetadata: { contentType: mime },
    customMetadata: {
      userId,
      ...(width != null ? { width: String(width) } : {}),
      ...(height != null ? { height: String(height) } : {}),
    },
  });

  const db = createDb(c.env.DB);
  await db.insert(uploads).values({ id, userId, mime, bytes: buf.byteLength, width, height, r2Key });

  return c.json({ id, url: `/api/images/${id}`, width, height }, 201);
});
