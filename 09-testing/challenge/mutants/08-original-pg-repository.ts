// @mutant-of: src/repositories/pgWalletRepository.ts
// @mutant: the file exactly as you received it (killed once your tests expose real bug #2)
import type pg from "pg";
import type { Transaction, TransactionType, Wallet } from "../domain/wallet.js";
import type { WalletChange, WalletRepository } from "./walletRepository.js";

interface WalletRow {
  id: string;
  owner: string;
  balance_cents: number;
  created_at: Date;
}

interface TransactionRow {
  id: string;
  wallet_id: string;
  type: TransactionType;
  amount_cents: string;
  created_at: Date;
}

const toWallet = (row: WalletRow): Wallet => ({
  id: row.id,
  owner: row.owner,
  balanceCents: row.balance_cents,
  createdAt: row.created_at.toISOString(),
});

const toTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  walletId: row.wallet_id,
  type: row.type,
  amountCents: Number(row.amount_cents),
  createdAt: row.created_at.toISOString(),
});

export class PgWalletRepository implements WalletRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insertWallet(wallet: Wallet): Promise<void> {
    await this.pool.query(
      "INSERT INTO wallets (id, owner, balance_cents, created_at) VALUES ($1, $2, $3, $4)",
      [wallet.id, wallet.owner, wallet.balanceCents, wallet.createdAt],
    );
  }

  async findById(id: string): Promise<Wallet | undefined> {
    const { rows } = await this.pool.query<WalletRow>(
      "SELECT id, owner, balance_cents, created_at FROM wallets WHERE id = $1",
      [id],
    );
    return rows[0] ? toWallet(rows[0]) : undefined;
  }

  async commit(change: WalletChange): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const w of change.wallets) {
        await client.query("UPDATE wallets SET balance_cents = $2 WHERE id = $1", [w.id, w.balanceCents]);
      }
      for (const t of change.transactions) {
        await client.query(
          "INSERT INTO transactions (id, wallet_id, type, amount_cents, created_at) VALUES ($1, $2, $3, $4, $5)",
          [t.id, t.walletId, t.type, t.amountCents, t.createdAt],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async listTransactions(walletId: string, limit: number): Promise<Transaction[]> {
    const { rows } = await this.pool.query<TransactionRow>(
      `SELECT id, wallet_id, type, amount_cents, created_at
         FROM transactions
        WHERE wallet_id = $1
        ORDER BY created_at DESC, seq DESC
        LIMIT $2`,
      [walletId, limit],
    );
    return rows.map(toTransaction);
  }

  async sumWithdrawalsSince(walletId: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
         FROM transactions
        WHERE wallet_id = $1 AND type = 'withdrawal' AND created_at >= $2`,
      [walletId, since],
    );
    return Number(rows[0]?.total ?? 0);
  }
}
