/** Response shapes returned by the Hamyon API. */

export interface User {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WalletSummary {
  address: string;
  network: string;
}

export interface Balance {
  raw: string;
  formatted: string;
  symbol: string;
  decimals: number;
}

export interface WalletDetail extends WalletSummary {
  chainId: number;
  explorerUrl: string;
  balance: Balance;
  gasSponsored: boolean;
}

export type TransferStatus =
  | "pending_otp"
  | "broadcasting"
  | "completed"
  | "failed"
  | "expired";

export interface Transfer {
  id: string;
  to: string;
  from: string;
  amount: string;
  status: TransferStatus;
  txHash: string | null;
  error: string | null;
  explorerUrl: string | null;
  createdAt: string;
}

export interface Transaction {
  hash: string | null;
  direction: "in" | "out" | "unknown";
  from: string;
  to: string;
  amount: string;
  symbol: string;
  timestamp: number;
  status: "pending" | "confirmed";
  explorerUrl: string | null;
  source: "chain" | "local";
}

export interface TransactionsResponse {
  transactions: Transaction[];
  address: string;
  indexerError: string | null;
}

export interface Capabilities {
  wallet: boolean;
  gasStation: boolean;
  history: boolean;
  onramp: boolean;
  offramp: boolean;
  otpOnSend: boolean;
  network: string;
  chainId: number;
  explorerBaseUrl: string;
}

export interface SessionResponse {
  user: User;
  wallet: WalletSummary | null;
}

export interface SendResponse {
  requiresOtp: boolean;
  transfer: Transfer;
  message?: string;
}

export interface OkResponse {
  ok: boolean;
  message?: string;
}
