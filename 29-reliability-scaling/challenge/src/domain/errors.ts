import type { ServiceName } from "./product.js";

/** The product doesn't exist. An expected answer, not a failure of the downstream. */
export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
  constructor(readonly resource: string) {
    super(`${resource} not found`);
  }
}

/** A downstream answered with an error status (or the connection failed: status 0). */
export class DownstreamError extends Error {
  override readonly name = "DownstreamError";
  constructor(
    readonly service: ServiceName,
    readonly status: number,
    message = `${service} responded ${status}`,
  ) {
    super(message);
  }
}

/** A dependency we can't do without (the catalog) is unavailable. Maps to 503. */
export class UpstreamUnavailableError extends Error {
  override readonly name = "UpstreamUnavailableError";
  constructor(
    readonly service: ServiceName,
    /** Seconds the client should wait before retrying. */
    readonly retryAfterSeconds: number,
    options?: { cause?: unknown },
  ) {
    super(`${service} is unavailable`, options);
  }
}
