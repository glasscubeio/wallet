import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { ApiError, type ErrorDetails } from "../utils/ApiError.ts";

/** Validates req.body against a zod schema and replaces it with the parsed value. */
export function validate(schema: ZodType): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details: ErrorDetails = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        details[key] ??= issue.message;
      }
      return next(
        ApiError.badRequest("Check the highlighted fields", "validation_error", details),
      );
    }
    req.body = result.data;
    next();
  };
}

/** Same, for query strings — Express 5 makes req.query read-only. */
export function validateQuery(schema: ZodType): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return next(ApiError.badRequest("Invalid query parameters", "validation_error"));
    }
    req.validatedQuery = result.data;
    next();
  };
}

/** Typed accessor for whatever `validateQuery` parsed. */
export function parsedQuery<T>(req: Request): T {
  return req.validatedQuery as T;
}
