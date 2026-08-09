/**
 * 퍼블릭 라우터 — 인증 없이 접근 가능한 읽기 전용 엔드포인트.
 * jwtAuth 를 적용하지 않는다(인덱스에서 다른 인증 라우터와 별도 마운트).
 * 접근은 오직 추측 불가 capability 토큰(shareToken)으로 제어 → 존재 은닉.
 */
import { Hono } from 'hono';
import { createDb } from '../db/index.js';
import { ensurePublicReport } from '../lib/authz.js';
import type { AppEnv } from '../types.js';
import type { PublicReportView } from '@shared/report';

export const publicRoutes = new Hono<AppEnv>();

/**
 * 퍼블릭 링크로 보고서 읽기(로그인 없음).
 * shareToken + shareEnabled=true 매칭. 미매칭 시 404(존재 은닉).
 * 응답은 렌더링에 필요한 최소 subset — id/userId/contentMd 등은 미노출.
 */
publicRoutes.get('/reports/:token', async (c) => {
  const db = createDb(c.env.DB);
  const row = await ensurePublicReport(db, c.req.param('token'));
  return c.json({
    title: row.title,
    content: JSON.parse(row.content),
    templateOptions: JSON.parse(row.templateOptions),
    updatedAt: row.updatedAt,
  } satisfies PublicReportView);
});
