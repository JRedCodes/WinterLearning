// @mutant-of: src/domain/limits.ts
// @mutant: the file exactly as you received it (killed once your tests expose real bug #1)
/**
 * Withdrawal limits.
 *
 * Product rule: a wallet may withdraw at most DAILY_WITHDRAWAL_LIMIT_CENTS
 * per UTC calendar day (00:00:00.000Z up to, not including, the next
 * midnight). Transfers don't count towards the limit.
 */
export const DAILY_WITHDRAWAL_LIMIT_CENTS = 100_000;

/** Midnight UTC at the start of the day that contains `at`. */
export function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDay()));
}

/** True when withdrawing `amountCents` on top of what was already withdrawn today breaks the limit. */
export function exceedsDailyLimit(withdrawnTodayCents: number, amountCents: number, limitCents: number): boolean {
  return withdrawnTodayCents + amountCents > limitCents;
}
