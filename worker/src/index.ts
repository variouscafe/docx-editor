import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from './types.js';
import { ApiHttpError } from './lib/errors.js';
import { reportRoutes } from './routes/reports.js';
import { templateRoutes } from './routes/templates.js';
import { groupRoutes } from './routes/groups.js';
import { publicRoutes } from './routes/public.js';
import { uploadRoutes } from './routes/uploads.js';
import { imageRoutes } from './routes/images.js';

// 데이터 API 전용. 인증(구글 로그인/JWT 발급)은 공용 suseona-auth 가 담당.
// 본 Worker 는 suseona-auth 가 발급한 JWT 를 같은 JWT_SECRET 로 검증(jwtAuth)만 수행.
const app = new Hono<AppEnv>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['authorization', 'content-type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ ok: true, name: 'docx-editor-api' }));

app.onError((err, c) => {
  if (err instanceof ApiHttpError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      err.status as ContentfulStatusCode,
    );
  }
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
});

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

app.route('/api/reports', reportRoutes);
app.route('/api/templates', templateRoutes);
app.route('/api/groups', groupRoutes);
// 퍼블릭 라우터 — 인증 없음(jwtAuth 미적용). 토큰 capability 로만 접근 제어.
app.route('/api/public', publicRoutes);
// 이미지 업로드(jwtAuth 내부 적용) + 이미지 조회(인증 없음 — UUID capability, img 태그용).
app.route('/api/uploads', uploadRoutes);
app.route('/api/images', imageRoutes);

export default app;
