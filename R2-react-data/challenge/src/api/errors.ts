import type { Problem } from "../schemas/task";

/**
 *  network          the request never got a response (offline, DNS, CORS, server down)
 *  http             the server answered with a non-2xx status
 *  invalid_response the server answered 2xx, but the body isn't what the contract says
 */
export type ApiErrorKind = "network" | "http" | "invalid_response";

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  /** Field-level validation messages keyed by field name, e.g. { title: "Title is required" }. */
  fieldErrors?: Record<string, string>;
  problem?: Problem;
  cause?: unknown;
}

/**
 * The ONLY error type the API layer throws (besides AbortError on cancellation).
 * Components never see a raw Response or a fetch TypeError, they get this.
 */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly fieldErrors: Record<string, string>;
  readonly problem: Problem | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause });
    this.kind = init.kind;
    this.status = init.status;
    this.fieldErrors = init.fieldErrors ?? {};
    this.problem = init.problem;
  }

  /** 412 Precondition Failed: our If-Match version was stale (someone else changed it). */
  get isConflict(): boolean {
    return this.status === 412;
  }
}

/** A human-readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
