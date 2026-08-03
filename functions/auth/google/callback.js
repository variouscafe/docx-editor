// GET /auth/google/callback — Pages Function. state 검증 후 Worker 에 코드 교환을 요청하고
// SPA 루트로 토큰을 fragment 에 담아 리다이렉트. dev 기본값 localhost:8787, prod 는 AUTH_API_URL env 필수.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = getCookie(request.headers.get('cookie'), 'oauth_state');
  if (!code || !state || !cookieState || state !== cookieState) {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/auth/google/callback`;
  // 공용 suseona-auth. Pages 환경변수 AUTH_API_URL 로 오버라이드 가능.
  const apiUrl = (env.AUTH_API_URL || 'https://suseona-api.suseona.com').replace(/\/$/, '');
  if (!apiUrl) return new Response('AUTH_API_URL not configured', { status: 500 });

  let res;
  try {
    res = await fetch(`${apiUrl}/auth/google/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, redirectUri }),
    });
  } catch {
    return new Response('Google login service unavailable', { status: 502 });
  }
  if (!res.ok) return new Response('Google login failed', { status: 400 });

  const tokens = await res.json();
  const loc = new URL(origin);
  loc.hash = `at=${encodeURIComponent(tokens.accessToken)}&rt=${encodeURIComponent(tokens.refreshToken)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: loc.toString(),
      'Set-Cookie': 'oauth_state=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0',
    },
  });
}

function getCookie(header, name) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    const k = i >= 0 ? part.slice(0, i).trim() : part.trim();
    if (k === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}
