import type { NextFunction, Request, Response } from "express";
import { User, type UserDoc } from "../models/User.ts";
import { ApiError } from "../utils/ApiError.ts";
import { ACCESS_COOKIE, verifyAccessToken } from "../utils/tokens.ts";

/**
 * Reads the access token from the httpOnly cookie only — no Authorization
 * header, no localStorage. The browser is the only thing holding a token.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) return next(ApiError.unauthorized());

  let sub: string;
  try {
    sub = verifyAccessToken(token).sub;
  } catch (err) {
    const expired = err instanceof Error && err.name === "TokenExpiredError";
    return next(
      ApiError.unauthorized("Session expired", expired ? "token_expired" : "invalid_token"),
    );
  }

  const user = await User.findById(sub);
  if (!user) return next(ApiError.unauthorized("Account no longer exists", "user_gone"));

  req.user = user;
  next();
}

/**
 * Narrows `req.user` for handlers mounted behind `requireAuth`. It should be
 * impossible to reach one without a user, so this throwing is a wiring bug
 * rather than a runtime condition.
 */
export function requireUser(req: Request): UserDoc {
  if (!req.user) throw ApiError.internal("Route is missing requireAuth", "missing_auth_middleware");
  return req.user;
}
