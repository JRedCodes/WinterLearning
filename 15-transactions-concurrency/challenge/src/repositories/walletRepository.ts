import type { Queryable } from "../lib/db.js";
import { toNumber } from "../lib/db.js";
import type { Wallet } from "../domain/types.js";
import { InsufficientFundsError, NotFoundError } from "../domain/errors.js";

interface WalletRow {
  id: string;
  owner: string;
  balance_cents: string;
}

const toWallet = (r: WalletRow): Wallet => ({
  id: toNumber(r.id),
  owner: r.owner,
  balanceCents: toNumber(r.balance_cents),
});

export class WalletRepository {
  async create(db: Queryable, input: { owner: string; balanceCents: number }): Promise<Wallet> {
    const { rows } = await db.query<WalletRow>(
      `INSERT INTO wallets (owner, balance_cents) VALUES ($1, $2)
       RETURNING id, owner, balance_cents`,
      [input.owner, input.balanceCents],
    );
    return toWallet(rows[0]!);
  }

  async findById(db: Queryable, id: number): Promise<Wallet | undefined> {
    const { rows } = await db.query<WalletRow>(
      "SELECT id, owner, balance_cents FROM wallets WHERE id = $1",
      [id],
    );
    return rows[0] ? toWallet(rows[0]) : undefined;
  }

  /**
   * Adds `deltaCents` (negative = debit) to the wallet and returns the new balance.
   * Throws NotFoundError for unknown wallets and InsufficientFundsError if the
   * balance would go below zero.
   */
  async adjustBalance(db: Queryable, walletId: number, deltaCents: number): Promise<number> {
    const wallet = await this.findById(db, walletId);
    if (!wallet) throw new NotFoundError("Wallet", walletId);

    const newBalance = wallet.balanceCents + deltaCents;
    if (newBalance < 0) throw new InsufficientFundsError(walletId);

    await db.query("UPDATE wallets SET balance_cents = $2 WHERE id = $1", [walletId, newBalance]);
    return newBalance;
  }
}
