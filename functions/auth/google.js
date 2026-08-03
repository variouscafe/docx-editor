// GET /auth/google — Pages Function. SPA origin 에서 Google OAuth 시작(redirect_uri + CSRF state 쿠키).
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// 공개 OAuth 클라이언트 ID(민감 아님). Pages 환경변수 바인딩 지연 폴백용.
const GOOGLE_CLIENT_ID_DEFAULT = '585512821732-sjm8qb2f4p04bsc3480suk8btnekoebm.apps.googleusercontent.com';

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientId = env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID_DEFAULT;
  if (!clientId) return new Response('Google login is not configured', { status: 500 });

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/auth/google/callback`;
  const state = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  const secure = origin.startsWith('https://');
  const cookie = `oauth_state=${state}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=300${secure ? '; Secure' : ''}`;
  return new Response(null, {
    status: 302,
    headers: { Location: `${GOOGLE_AUTH_URL}?${params.toString()}`, 'Set-Cookie': cookie },
  });
}
