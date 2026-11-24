import { randomBytes } from "node:crypto";
import { currentContext } from "./requestContext.js";

/**
 * A tiny, dependency-free slice of W3C Trace Context.
 * https://www.w3.org/TR/trace-context/
 *
 *   traceparent: 00-<trace-id: 32 hex>-<parent-id: 16 hex>-<flags: 2 hex>
 *
 * In a real service you'd let the OpenTelemetry SDK do this. Writing it by
 * hand once shows you there's no magic: it's one header, passed along.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZERO = /^0+$/;

export function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function newSpanId(): string {
  return randomBytes(8).toString("hex");
}

/** Returns undefined for anything that isn't a valid version-00 traceparent. */
export function parseTraceparent(header: string | undefined): TraceContext | undefined {
  if (!header) return undefined;
  const match = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!match) return undefined;
  const [, version, traceId, spanId, flags] = match as unknown as [string, string, string, string, string];
  if (version === "ff") return undefined;
  if (ALL_ZERO.test(traceId) || ALL_ZERO.test(spanId)) return undefined;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

export function formatTraceparent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? "01" : "00"}`;
}

/** A brand new trace: this service is the first hop. */
export function startTrace(): TraceContext {
  return { traceId: newTraceId(), spanId: newSpanId(), sampled: true };
}

/**
 * Join the caller's trace if it sent a valid traceparent: keep its trace id
 * and sampling decision, but this service's work gets a new span id.
 * Otherwise start a new trace.
 */
export function continueTrace(incoming: string | undefined): TraceContext {
  const parent = parseTraceparent(incoming);
  if (!parent) return startTrace();
  return { traceId: parent.traceId, spanId: newSpanId(), sampled: parent.sampled };
}

/** A child span for an outgoing call: same trace, new span id. */
export function childSpan(ctx: TraceContext): TraceContext {
  return { ...ctx, spanId: newSpanId() };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Wraps fetch so every outgoing call carries the current request's
 * correlation headers. Clients (like PaymentsClient) use this instead of
 * the global fetch and never think about tracing again.
 */
export function createTracedFetch(fetchImpl: FetchLike = fetch): FetchLike {
  return (url, init = {}) => {
    const ctx = currentContext();
    const headers = new Headers(init.headers);
    if (ctx) {
      headers.set("x-request-id", ctx.requestId);
    }
    return fetchImpl(url, { ...init, headers });
  };
}
