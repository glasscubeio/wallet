import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

/**
 * One CDP-managed EOA per user.
 *
 * This is a plain externally-owned account, not a smart account: gasless
 * transfers are achieved with EIP-3009 signed authorizations relayed by our own
 * operator wallet, so there is no ERC-4337 stack and no third-party paymaster
 * in the path.
 *
 * No key material is stored here. CDP holds the key, and it is reachable from
 * any device because it is bound to the user's account rather than a browser.
 */
export interface IWallet {
  user: Types.ObjectId;
  address: string;
  /** CDP resource name, used to re-derive the account idempotently. */
  accountName: string;
  network: string;
  createdAt: Date;
  updatedAt: Date;
}

export type WalletDoc = HydratedDocument<IWallet>;

const walletSchema = new Schema<IWallet>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    address: { type: String, required: true, index: true },
    accountName: { type: String, required: true },
    network: { type: String, required: true },
  },
  { timestamps: true },
);

export const Wallet = mongoose.model<IWallet>("Wallet", walletSchema);
