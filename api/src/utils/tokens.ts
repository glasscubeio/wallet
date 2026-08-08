import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { CookieOptions, Response } from "express";
import { env, isProd } from "../config/env.ts";
import type { UserDoc } from "../models/User.ts";

export const ACCESS_COOKIE = "hamyon_at";
export const REFRESH_COOKIE = "hamyon_rt";

export interface AccessPayload {
  sub: string;
  typ: "access";
  exp: number;
  iat: number;
}

export interface RefreshPayload {
  sub: string;
  typ: "refresh";
  jti: string;
  exp: number;
  iat: number;
}

/**
 * Cross-subdomain in production (api on wa.*, app on wallet.*), so the cookie
 * must be scoped to the shared parent domain and marked SameSite=None+Secure.
 * On localhost both run on 127.0.0.1 with different ports, which is same-site,
 * so Lax over http works.
 */
function baseCookie(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    domain: isProd ? env.COOKIE_DOMAIN || undefined : undefined,
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function signAccessToken(user: UserDoc): string {
  return jwt.sign({ sub: user._id.toString(), typ: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);
}

export function signRefreshToken(user: UserDoc, jti: string): string {
  return jwt.sign(
    { sub: user._id.toString(), typ: "refresh", jti },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_TTL } as jwt.SignOptions,
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
  if (payload.typ !== "access") throw new Error("wrong token type");
  return payload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  if (payload.typ !== "refresh") throw new Error("wrong token type");
  return payload;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function setAuthCookies(
  res: Response,
  { accessToken, refreshToken }: { accessToken: string; refreshToken: string },
): void {
  const access = jwt.decode(accessToken) as AccessPayload;
  const refresh = jwt.decode(refreshToken) as RefreshPayload;
  res.cookie(ACCESS_COOKIE, accessToken, baseCookie(access.exp * 1000 - Date.now()));
  res.cookie(REFRESH_COOKIE, refreshToken, baseCookie(refresh.exp * 1000 - Date.now()));
}

export function clearAuthCookies(res: Response): void {
  const { maxAge: _maxAge, ...opts } = baseCookie(0);
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}
