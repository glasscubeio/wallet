import type { NextFunction, Request, Response } from "express";
import { ApiError, type ErrorDetails } from "../utils/ApiError.ts";
import { isProd } from "../config/env.ts";

interface MongoDuplicateError {
  code: number;
  keyPattern?: Record<string, unknown>;
}

function isDuplicateKey(err: unknown): err is MongoDuplicateError {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`, "route_not_found"));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express identifies handlers by arity
  _next: NextFunction,
): void {
  let error: ApiError;

  if (err instanceof ApiError) {
    error = err;
  } else if (isDuplicateKey(err)) {
    // Duplicate key -> name the field, so the UI can point at the right input.
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "field";
    const label = field === "email" ? "Email" : field === "username" ? "Username" : field;
    const details: ErrorDetails = { [field]: `${label} is already taken` };
    error = ApiError.conflict(`${label} is already taken`, "duplicate", details);
  } else if (err instanceof Error && err.name === "ValidationError") {
    error = ApiError.badRequest("Check the highlighted fields", "validation_error");
  } else if (err instanceof Error && err.name === "CastError") {
    error = ApiError.badRequest("Malformed identifier", "cast_error");
  } else {
    console.error("[error]", err);
    error = ApiError.internal();
  }

  if (error.status >= 500) console.error("[error]", err);

  res.status(error.status).json({
    error: {
      message: error.expose ? error.message : "Something went wrong",
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
      ...(isProd || error.expose ? {} : { stack: err instanceof Error ? err.stack : undefined }),
    },
  });
}
