import type { RequestHandler } from "express";
import type { z } from "zod";

export interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/** What validate() stores on res.locals.validated for the controller. */
export interface Validated {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

/**
 * TODO(3): validate({ body, query, params }) middleware factory
 *
 * For each schema that was given, safeParse the matching part of the request
 * (req.body, req.query, req.params).
 *
 *  - If ALL parts are valid: store the PARSED values (with coercions, defaults
 *    and transforms applied) on `res.locals.validated` as { body?, query?, params? }
 *    and call next().
 *  - If ANY part is invalid: collect the issues from EVERY part (don't stop at
 *    the first one) and pass a ValidationError to next(). Each detail is
 *      { path: "<part>.<issue path joined with '.'>", message: issue.message }
 *    e.g. { path: "body.priceCents", message: "..." }, { path: "query.limit", ... }.
 *    An issue with an empty path (a whole-object rule) gets just "<part>", e.g. "body".
 *
 * Why res.locals? In Express 5 `req.query` is a read-only getter, and keeping
 * the raw request untouched makes debugging easier anyway.
 */
export function validate(_schemas: ValidationSchemas): RequestHandler {
  return (_req, _res, next) => {
    next();
  };
}
