import type { Queryable } from "../lib/db.js";
import type { LedgerKind } from "../domain/types.js";

export class LedgerRepository {
  /** Appends one money movement. Always call it in the same transaction as the balance change. */
  async add(
    db: Queryable,
    entry: { walletId: number; amountCents: number; kind: LedgerKind; reference?: string },
  ): Promise<void> {
    await db.query(
      `INSERT INTO ledger_entries (wallet_id, amount_cents, kind, reference)
       VALUES ($1, $2, $3, $4)`,
      [entry.walletId, entry.amountCents, entry.kind, entry.reference ?? null],
    );
  }
}
