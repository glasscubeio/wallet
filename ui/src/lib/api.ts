import type {
  Capabilities,
  OkResponse,
  SendResponse,
  SessionResponse,
  Transfer,
  TransactionsResponse,
  User,
  WalletDetail,
  Balance,
} from "@/types/api";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:9550";

export type ErrorDetails = Record<string, string>;

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly details: ErrorDetails;

  constructor(
    message: string,
    { status, code, details }: { status?: number; code?: string; details?: ErrorDetails } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details ?? {};
  }
}

interface ErrorBody {
  error?: { message?: string; code?: string; details?: ErrorDetails };
}

let refreshInFlight: Promise<Response> | null = null;

/**
 * Transparently refreshes an expired access token once, then replays the
 * original request. Concurrent 401s share a single refresh so a page that
 * fires several requests at mount doesn't rotate the token multiple times.
 */
async function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= fetch(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  }).finally(() => {
    refreshInFlight = null;
  });

  return (await refreshInFlight).ok;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  retry?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, retry = true, signal } = options;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      // The whole auth story lives in httpOnly cookies — nothing is read from
      // or written to localStorage.
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ApiError("Can't reach the server. Check your connection.", {
      code: "network_error",
    });
  }

  if (res.status === 401 && retry && !path.startsWith("/api/auth/refresh")) {
    const payload = (await res.clone().json().catch(() => ({}))) as ErrorBody;
    // Only an expired token is worth retrying; a revoked session won't recover.
    if (payload.error?.code === "token_expired" && (await refreshOnce())) {
      return request<T>(path, { ...options, retry: false });
    }
  }

  if (res.status === 204) return null as T;

  const payload = (await res.json().catch(() => null)) as (ErrorBody & T) | null;

  if (!res.ok) {
    const err = payload?.error ?? {};
    throw new ApiError(err.message ?? "Something went wrong", {
      status: res.status,
      code: err.code,
      details: err.details,
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
};

export const authApi = {
  register: (body: { username: string; email: string; password: string }) =>
    api.post<SessionResponse>("/api/auth/register", body),
  login: (body: { identifier: string; password: string }) =>
    api.post<{ user: User }>("/api/auth/login", body),
  logout: () => api.post<OkResponse>("/api/auth/logout"),
  logoutAll: () => api.post<OkResponse>("/api/auth/logout-all"),
  me: (opts?: RequestOptions) => api.get<SessionResponse>("/api/auth/me", opts),
  requestEmailVerification: () => api.post<OkResponse>("/api/auth/verify-email/request"),
  confirmEmailVerification: (code: string) =>
    api.post<OkResponse & { user: User }>("/api/auth/verify-email/confirm", { code }),
  forgotPassword: (email: string) => api.post<OkResponse>("/api/auth/forgot-password", { email }),
  resetPassword: (body: { email: string; code: string; password: string }) =>
    api.post<OkResponse>("/api/auth/reset-password", body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.post<OkResponse>("/api/auth/change-password", body),
  requestAccountDeletion: () => api.post<OkResponse>("/api/auth/delete-account/request"),
  confirmAccountDeletion: (body: { password: string; code: string }) =>
    api.post<OkResponse>("/api/auth/delete-account/confirm", body),
};

export const walletApi = {
  capabilities: () => api.get<Capabilities>("/api/wallet/capabilities"),
  get: () => api.get<WalletDetail>("/api/wallet"),
  balance: () => api.get<Balance>("/api/wallet/balance"),
  transactions: (limit = 50) =>
    api.get<TransactionsResponse>(`/api/wallet/transactions?limit=${limit}`),
  send: (body: { to: string; amount: string }) =>
    api.post<SendResponse>("/api/wallet/send", body),
  confirmSend: (body: { transferId: string; code: string }) =>
    api.post<{ transfer: Transfer }>("/api/wallet/send/confirm", body),
  transfer: (id: string) => api.get<{ transfer: Transfer }>(`/api/wallet/transfers/${id}`),
  onramp: (amount?: number) =>
    api.get<{ url: string }>(`/api/wallet/onramp${amount ? `?amount=${amount}` : ""}`),
  offramp: (amount?: number) =>
    api.get<{ url: string }>(`/api/wallet/offramp${amount ? `?amount=${amount}` : ""}`),
};
