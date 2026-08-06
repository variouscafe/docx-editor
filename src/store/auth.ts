import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeJwt } from '../lib/jwt';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthState extends Partial<AuthTokens> {
  userId?: string;
  email?: string;
  name?: string | null;
  setTokens: (tokens: AuthTokens) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      setTokens: (tokens) => {
        const payload = decodeJwt(tokens.accessToken);
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userId: typeof payload?.sub === 'string' ? (payload.sub as string) : undefined,
          email: typeof payload?.email === 'string' ? (payload.email as string) : undefined,
          name:
            typeof payload?.name === 'string'
              ? (payload.name as string)
              : payload?.name === null
                ? null
                : undefined,
        });
      },
      logout: () =>
        set({
          accessToken: undefined,
          refreshToken: undefined,
          userId: undefined,
          email: undefined,
          name: undefined,
        }),
    }),
    { name: 'docx-auth' },
  ),
);
