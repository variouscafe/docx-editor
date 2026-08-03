import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { useAuthStore } from './store/auth';
import { useThemeStore, applyTheme } from './store/theme';
import './index.css';

// /auth/google/callback 가 URL fragment(#at=&rt=)로 돌려준 토큰을 React 렌더 전에 소비.
// 컴포넌트 effect 에서 처리하면 첫 렌더 시 가드가 /login 으로 보내 fragment 를 잃음.
const hash = window.location.hash;
if (hash.includes('at=') && hash.includes('rt=')) {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const at = params.get('at');
  const rt = params.get('rt');
  if (at && rt) useAuthStore.getState().setTokens({ accessToken: at, refreshToken: rt, expiresIn: 900 });
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

// 다크모드 FOUC 방지 — React 렌더 전에 localStorage 의 테마를 <html> 에 적용.
applyTheme(useThemeStore.getState().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
