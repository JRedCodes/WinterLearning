import { DependencyUnavailableError } from "../domain/errors.js";
import type { FetchLike } from "../lib/tracing.js";

export interface AuthorizeRequest {
  amountCents: number;
  cardNumber: string;
  cvc: string;
}

export type AuthorizeResult = { status: "approved"; authorizationId: string } | { status: "declined" };

/** What the service layer depends on. Tests and the real client both implement it. */
export interface PaymentsGateway {
  authorize(request: AuthorizeRequest): Promise<AuthorizeResult>;
  /** Cheap call used by /readyz. Throws if payments can't be reached. */
  ping(): Promise<void>;
}

/**
 * HTTP client for the payments service.
 *
 * Note the timeout: every outgoing call needs one. A dependency that hangs
 * without a timeout turns *its* outage into *your* outage (see incident/).
 */
export class PaymentsClient implements PaymentsGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
    private readonly timeoutMs = 2000,
  ) {}

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    const res = await this.call("/authorizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (res.status === 402) return { status: "declined" };
    if (!res.ok) throw new DependencyUnavailableError("payments", { cause: new Error(`HTTP ${res.status}`) });
    const body = (await res.json()) as { authorizationId?: unknown };
    if (typeof body.authorizationId !== "string") {
      throw new DependencyUnavailableError("payments", { cause: new Error("malformed response") });
    }
    return { status: "approved", authorizationId: body.authorizationId };
  }

  async ping(): Promise<void> {
    const res = await this.call("/health", { method: "GET" });
    if (!res.ok) throw new Error(`payments health returned HTTP ${res.status}`);
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(new URL(path, this.baseUrl).toString(), {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new DependencyUnavailableError("payments", { cause: err });
    }
  }
}
