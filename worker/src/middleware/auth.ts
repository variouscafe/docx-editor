import { createMiddleware } from 'hono/factory';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../types.js';
import type { UserContext } from '../env.js';
import { verifyJwt } from '../crypto/jwt.js';
import { createDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { unauthorized } from '../lib/errors.js';

/** Verifies a user access JWT and attaches the user context. */
export const jwtAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearer(c.req.header('authorization'));
  if (!token) throw unauthorized('Missing bearer token');
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload || payload.type === 'refresh') throw unauthorized('Invalid token');
  const user: UserContext = {
    userId: payload.sub,
    email: payload.email ?? '',
    name: payload.name ?? null,
  };
  c.set('user', user);
  // 사용자 식별 캐시 upsert(그룹 멤버 표시용). 실패해도 인증 자체는 통과시킨다.
  // email 은 소문자로 정규화(초대/검색 매칭의 일관성).
  const emailLower = user.email ? user.email.toLowerCase() : null;
  try {
    await createDb(c.env.DB)
      .insert(users)
      .values({
        userId: user.userId,
        email: emailLower,
        name: user.name,
      })
      .onConflictDoUpdate({
        target: users.userId,
        set: {
          email: emailLower,
          name: user.name,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  } catch {
    /* ignore cache write errors — 인증은 이미 검증됨 */
  }
  await next();
});

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]! : null;
}
