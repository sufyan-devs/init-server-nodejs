import type { AuthUser } from "@user/models/User";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Session id — the `<sid>` half of the cookie token. A Redis key, not an ObjectId. */
      sessionId?: string;
      requestId?: string;
    }
  }
}
