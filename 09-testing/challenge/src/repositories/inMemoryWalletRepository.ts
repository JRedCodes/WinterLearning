import type { Transaction, Wallet } from "../domain/wallet.js";
import type { WalletChange, WalletRepository } from "./walletRepository.js";

/** Fast, dependency-free implementation. Handy for unit tests and local experiments. */
export class InMemoryWalletRepository implements WalletRepository {
  readonly #wallets = new Map<string, Wallet>();
  readonly #transactions: Transaction[] = [];

  async insertWallet(wallet: Wallet): Promise<void> {
    if (this.#wallets.has(wallet.id)) throw new Error(`duplicate wallet id ${wallet.id}`);
    this.#wallets.set(wallet.id, { ...wallet });
  }

  async findById(id: string): Promise<Wallet | undefined> {
    const wallet = this.#wallets.get(id);
    return wallet ? { ...wallet } : undefined;
  }

  async commit(change: WalletChange): Promise<void> {
    for (const w of change.wallets) {
      if (!this.#wallets.has(w.id)) throw new Error(`unknown wallet ${w.id}`);
    }
    for (const w of change.wallets) this.#wallets.set(w.id, { ...w });
    for (const t of change.transactions) this.#transactions.push({ ...t });
  }

  async listTransactions(walletId: string, limit: number): Promise<Transaction[]> {
    return this.#transactions
      .filter((t) => t.walletId === walletId)
      .reverse()
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  async sumWithdrawalsSince(walletId: string, since: Date): Promise<number> {
    return this.#transactions
      .filter((t) => t.walletId === walletId && t.type === "withdrawal" && new Date(t.createdAt) >= since)
      .reduce((sum, t) => sum + t.amountCents, 0);
  }
}
