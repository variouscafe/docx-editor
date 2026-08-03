import type { Bindings, UserContext } from './env.js';

/** Hono environment shared by all routes. */
export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    user: UserContext;
  };
}
