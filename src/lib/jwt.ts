/** Decode a JWT payload (no verification — client only reads its own email/name). */
export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]!;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
