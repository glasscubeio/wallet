export type ErrorDetails = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  details: ErrorDetails | undefined;
  expose: boolean;

  constructor(status: number, message: string, code?: string, details?: ErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }

  static badRequest(message: string, code?: string, details?: ErrorDetails): ApiError {
    return new ApiError(400, message, code, details);
  }
  static unauthorized(message = "Not authenticated", code = "unauthenticated"): ApiError {
    return new ApiError(401, message, code);
  }
  static forbidden(message = "Not allowed", code = "forbidden"): ApiError {
    return new ApiError(403, message, code);
  }
  static notFound(message = "Not found", code = "not_found"): ApiError {
    return new ApiError(404, message, code);
  }
  static conflict(message: string, code = "conflict", details?: ErrorDetails): ApiError {
    return new ApiError(409, message, code, details);
  }
  static tooMany(message = "Too many requests", code = "rate_limited"): ApiError {
    return new ApiError(429, message, code);
  }
  static internal(message = "Something went wrong", code = "internal"): ApiError {
    const err = new ApiError(500, message, code);
    err.expose = false;
    return err;
  }
  /**
   * A dependency isn't wired up yet. Distinct from `internal` because the
   * message is safe — and useful — to show, so the UI can name the missing
   * provider instead of a blank "something went wrong".
   */
  static unavailable(message: string, code = "service_unavailable"): ApiError {
    return new ApiError(503, message, code);
  }
}
