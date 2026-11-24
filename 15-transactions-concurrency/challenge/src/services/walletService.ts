import type pg from "pg";
import { withTransaction } from "../lib/db.js";
import type { Transfer, Wallet } from "../domain/types.js";
import { InvalidOperationError, NotFoundError } from "../domain/errors.js";
import type { WalletRepository } from "../repositories/walletRepository.js";
import type { LedgerRepository } from "../repositories/ledgerRepository.js";

export interface WalletServiceDeps {
  pool: pg.Pool;
  wallets: WalletRepository;
  ledger: LedgerRepository;
}

export interface TransferResult extends Transfer {
  fromBalanceCents: number;
  toBalanceCents: number;
}

export class WalletService {
  constructor(private readonly deps: WalletServiceDeps) {}

  /** Opens a wallet. A starting balance is recorded as a deposit in the ledger. */
  create(input: { owner: string; initialBalanceCents: number }): Promise<Wallet> {
    const { pool, wallets, ledger } = this.deps;
    return withTransaction(pool, async (tx) => {
      const wallet = await wallets.create(tx, { owner: input.owner, balanceCents: input.initialBalanceCents });
      if (input.initialBalanceCents > 0) {
        await ledger.add(tx, {
          walletId: wallet.id,
          amountCents: input.initialBalanceCents,
          kind: "deposit",
          reference: "initial",
        });
      }
      return wallet;
    });
  }

  async get(id: number): Promise<Wallet> {
    const wallet = await this.deps.wallets.findById(this.deps.pool, id);
    if (!wallet) throw new NotFoundError("Wallet", id);
    return wallet;
  }

  /** Adds money to a wallet (e.g. a card top-up that already succeeded). */
  async deposit(walletId: number, amountCents: number): Promise<Wallet> {
    const { pool, wallets, ledger } = this.deps;

    // Ported as-is from the old payments worker, which predates withTransaction().
    const client = await pool.connect();
    await client.query("BEGIN");
    const balanceCents = await wallets.adjustBalance(client, walletId, amountCents);
    await ledger.add(client, { walletId, amountCents, kind: "deposit" });
    await client.query("COMMIT");
    client.release();

    const wallet = await wallets.findById(pool, walletId);
    return { ...wallet!, balanceCents };
  }

  /** Moves money between two wallets atomically. */
  async transfer(input: Transfer): Promise<TransferResult> {
    const { fromWalletId, toWalletId, amountCents } = input;
    if (fromWalletId === toWalletId) {
      throw new InvalidOperationError("Cannot transfer to the same wallet");
    }
    const { pool, wallets, ledger } = this.deps;

    return withTransaction(pool, async (tx) => {
      const fromBalanceCents = await wallets.adjustBalance(tx, fromWalletId, -amountCents);
      await ledger.add(tx, {
        walletId: fromWalletId,
        amountCents: -amountCents,
        kind: "transfer_out",
        reference: `to:${toWalletId}`,
      });

      const toBalanceCents = await wallets.adjustBalance(tx, toWalletId, amountCents);
      await ledger.add(tx, {
        walletId: toWalletId,
        amountCents,
        kind: "transfer_in",
        reference: `from:${fromWalletId}`,
      });

      return { ...input, fromBalanceCents, toBalanceCents };
    });
  }
}
