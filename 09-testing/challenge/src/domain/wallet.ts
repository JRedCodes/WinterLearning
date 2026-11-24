export interface Wallet {
  id: string;
  owner: string;
  /** Integer number of cents. Never negative. */
  balanceCents: number;
  createdAt: string;
}

export type TransactionType = "deposit" | "withdrawal" | "transfer_in" | "transfer_out";

export interface Transaction {
  id: string;
  walletId: string;
  type: TransactionType;
  /** Always positive; the type says which direction the money moved. */
  amountCents: number;
  createdAt: string;
}
