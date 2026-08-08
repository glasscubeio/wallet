import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

export const TRANSFER_STATUS = {
  PENDING_OTP: "pending_otp",
  BROADCASTING: "broadcasting",
  COMPLETED: "completed",
  FAILED: "failed",
  EXPIRED: "expired",
} as const;

export type TransferStatus = (typeof TRANSFER_STATUS)[keyof typeof TRANSFER_STATUS];

/**
 * Outgoing sends initiated from the app. Basescan is the source of truth for
 * confirmed history, but this table lets the UI show a transfer the instant it
 * is submitted — before the indexer catches up.
 */
export interface ITransfer {
  user: Types.ObjectId;
  from: string;
  to: string;
  /** USDC base units (6 decimals) as a string, to avoid float drift. */
  amount: string;
  status: TransferStatus;
  /** EIP-3009 authorization nonce — also the replay guard on-chain. */
  authorizationNonce: string | null;
  validAfter: number | null;
  validBefore: number | null;
  txHash: string | null;
  /** Gas paid by the operator for this transfer, in wei. */
  gasPaidWei: string | null;
  relayerAddress: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TransferDoc = HydratedDocument<ITransfer>;

const transferSchema = new Schema<ITransfer>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    amount: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(TRANSFER_STATUS),
      default: TRANSFER_STATUS.PENDING_OTP,
      index: true,
    },
    authorizationNonce: { type: String, default: null, index: true },
    validAfter: { type: Number, default: null },
    validBefore: { type: Number, default: null },
    txHash: { type: String, default: null, index: true },
    gasPaidWei: { type: String, default: null },
    relayerAddress: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

export const Transfer = mongoose.model<ITransfer>("Transfer", transferSchema);
