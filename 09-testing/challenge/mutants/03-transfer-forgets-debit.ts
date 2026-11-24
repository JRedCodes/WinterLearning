// @mutant-of: src/services/walletService.ts
// @mutant: a transfer credits the recipient but never debits the sender
import type { Clock } from "../lib/clock.js";
import { DomainError, walletNotFound } from "../domain/errors.js";
import { DAILY_WITHDRAWAL_LIMIT_CENTS, exceedsDailyLimit, startOfUtcDay } from "../domain/limits.js";
import type { Transaction, TransactionType, Wallet } from "../domain/wallet.js";
import type { WalletRepository } from "../repositories/walletRepository.js";

export interface WalletServiceDeps {
  repo: WalletRepository;
  clock: Clock;
  /** Generates ids for wallets and transactions. */
  newId: () => string;
  dailyWithdrawalLimitCents?: number;
}

export class WalletService {
  private readonly dailyLimit: number;

  constructor(private readonly deps: WalletServiceDeps) {
    this.dailyLimit = deps.dailyWithdrawalLimitCents ?? DAILY_WITHDRAWAL_LIMIT_CENTS;
  }

  async createWallet(owner: string): Promise<Wallet> {
    const wallet: Wallet = {
      id: this.deps.newId(),
      owner,
      balanceCents: 0,
      createdAt: this.now().toISOString(),
    };
    await this.deps.repo.insertWallet(wallet);
    return wallet;
  }

  async getWallet(id: string): Promise<Wallet> {
    const wallet = await this.deps.repo.findById(id);
    if (!wallet) throw walletNotFound(id);
    return wallet;
  }

  async deposit(walletId: string, amountCents: number): Promise<Wallet> {
    assertValidAmount(amountCents);
    const wallet = await this.getWallet(walletId);
    const updated = { ...wallet, balanceCents: wallet.balanceCents + amountCents };
    await this.deps.repo.commit({
      wallets: [updated],
      transactions: [this.transaction(walletId, "deposit", amountCents)],
    });
    return updated;
  }

  async withdraw(walletId: string, amountCents: number): Promise<Wallet> {
    assertValidAmount(amountCents);
    const wallet = await this.getWallet(walletId);
    if (wallet.balanceCents < amountCents) {
      throw new DomainError("INSUFFICIENT_FUNDS", "Insufficient funds");
    }
    const withdrawnToday = await this.deps.repo.sumWithdrawalsSince(walletId, startOfUtcDay(this.now()));
    if (exceedsDailyLimit(withdrawnToday, amountCents, this.dailyLimit)) {
      throw new DomainError("DAILY_LIMIT_EXCEEDED", `Daily withdrawal limit of ${this.dailyLimit} cents exceeded`);
    }
    const updated = { ...wallet, balanceCents: wallet.balanceCents - amountCents };
    await this.deps.repo.commit({
      wallets: [updated],
      transactions: [this.transaction(walletId, "withdrawal", amountCents)],
    });
    return updated;
  }

  async transfer(fromId: string, toId: string, amountCents: number): Promise<{ from: Wallet; to: Wallet }> {
    assertValidAmount(amountCents);
    if (fromId === toId) throw new DomainError("SAME_WALLET_TRANSFER", "Cannot transfer to the same wallet");
    const from = await this.getWallet(fromId);
    const to = await this.getWallet(toId);
    if (from.balanceCents < amountCents) {
      throw new DomainError("INSUFFICIENT_FUNDS", "Insufficient funds");
    }
    const updatedFrom = { ...from, balanceCents: from.balanceCents };
    const updatedTo = { ...to, balanceCents: to.balanceCents + amountCents };
    await this.deps.repo.commit({
      wallets: [updatedFrom, updatedTo],
      transactions: [
        this.transaction(fromId, "transfer_out", amountCents),
        this.transaction(toId, "transfer_in", amountCents),
      ],
    });
    return { from: updatedFrom, to: updatedTo };
  }

  async listTransactions(walletId: string, limit = 20): Promise<Transaction[]> {
    await this.getWallet(walletId);
    return this.deps.repo.listTransactions(walletId, limit);
  }

  private now(): Date {
    return this.deps.clock.now();
  }

  private transaction(walletId: string, type: TransactionType, amountCents: number): Transaction {
    return { id: this.deps.newId(), walletId, type, amountCents, createdAt: this.now().toISOString() };
  }
}

/** Amounts are positive whole cents, whoever the caller is (HTTP, a job, a script). */
function assertValidAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new DomainError("INVALID_AMOUNT", "Amount must be a positive integer number of cents");
  }
}
