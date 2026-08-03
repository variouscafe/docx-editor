import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';
import type { UserContext } from '../env.js';
import { verifyJwt } from '../crypto/jwt.js';
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
  await next();
});

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]! : null;
}
