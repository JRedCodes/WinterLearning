import type { Transaction, Wallet } from "../domain/wallet.js";

/** A set of changes that must be applied all together or not at all. */
export interface WalletChange {
  wallets: Wallet[];
  transactions: Transaction[];
}

export interface WalletRepository {
  insertWallet(wallet: Wallet): Promise<void>;
  findById(id: string): Promise<Wallet | undefined>;
  /** Atomically updates the wallets' balances and records the transactions. */
  commit(change: WalletChange): Promise<void>;
  /** Newest first. */
  listTransactions(walletId: string, limit: number): Promise<Transaction[]>;
  /** Sum of `withdrawal` transactions with createdAt >= since. */
  sumWithdrawalsSince(walletId: string, since: Date): Promise<number>;
}
