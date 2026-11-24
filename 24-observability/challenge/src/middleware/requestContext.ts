import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "../lib/logger.js";
import { startTrace } from "../lib/tracing.js";

const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Runs first for every request. Establishes the request's identity:
 *  - a request id (reuse a sane incoming X-Request-Id, else generate one)
 *  - the trace context (W3C traceparent)
 *  - a child logger with requestId and traceId bound to every line
 */
export function requestContext(baseLogger: Logger): RequestHandler {
  return (req, res, next) => {
    const incomingId = req.get("x-request-id");
    const requestId = incomingId && VALID_REQUEST_ID.test(incomingId) ? incomingId : randomUUID();
    const trace = startTrace();
    const logger = baseLogger.child({ requestId, traceId: trace.traceId });

    res.locals.requestId = requestId;
    res.locals.trace = trace;
    res.locals.logger = logger;
    res.setHeader("X-Request-Id", requestId);

    logger.debug({ method: req.method, url: req.originalUrl, headers: req.headers }, "request received");
    next();
  };
}
