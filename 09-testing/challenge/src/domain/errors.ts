export type DomainErrorCode =
  | "WALLET_NOT_FOUND"
  | "INVALID_AMOUNT"
  | "INSUFFICIENT_FUNDS"
  | "DAILY_LIMIT_EXCEEDED"
  | "SAME_WALLET_TRANSFER";

/** A business rule was violated. The error handler maps `code` to an HTTP status. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const walletNotFound = (id: string) => new DomainError("WALLET_NOT_FOUND", `Wallet ${id} not found`);
