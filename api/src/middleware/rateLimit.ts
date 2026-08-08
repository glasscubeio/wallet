import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { ApiError } from "../utils/ApiError.ts";

/**
 * nginx handles the coarse per-IP limiting in front of this. These are the
 * backstops nginx can't express — they protect specific abuse paths (OTP
 * guessing, credential stuffing, mail flooding, draining the gas station) and
 * keep working if the API is ever reached without the proxy in front.
 */
function make({
  windowMs,
  max,
  message,
}: {
  windowMs: number;
  max: number;
  message: string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(ApiError.tooMany(message)),
  });
}

export const authLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many attempts. Try again in a few minutes.",
});

export const otpLimiter = make({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: "Too many codes requested. Wait a few minutes before trying again.",
});

// Every relayed transfer spends operator ETH, so this also caps gas burn.
export const sendLimiter = make({
  windowMs: 60 * 1000,
  max: 10,
  message: "Slow down — too many transfers in a row.",
});
