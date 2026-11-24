import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "./logger.js";
import type { TraceContext } from "./tracing.js";

/**
 * Everything that belongs to "the request currently being handled".
 *
 * AsyncLocalStorage carries this object through every `await`, timer and
 * callback that starts inside `runWithContext(ctx, fn)`, so deep code
 * (services, HTTP clients) can find the request's logger without it being
 * passed through every function signature.
 */
export interface RequestContext {
  requestId: string;
  trace: TraceContext;
  logger: Logger;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The request-scoped logger if we're inside a request, otherwise the fallback. */
export function currentLogger(fallback: Logger): Logger {
  return storage.getStore()?.logger ?? fallback;
}
