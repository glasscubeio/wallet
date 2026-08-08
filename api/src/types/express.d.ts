import type { UserDoc } from "../models/User.ts";

// `requireAuth` attaches the loaded user; `validateQuery` attaches the parsed
// query. Declaring them here means controllers get them typed for free.
declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
      validatedQuery?: unknown;
    }
  }
}

export {};
