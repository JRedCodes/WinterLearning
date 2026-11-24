import type { z } from "zod";

export interface ApiClientOptions {
  /** e.g. "http://localhost:3000". A trailing slash is fine. */
  baseUrl: string;
  /** Defaults to the global fetch, looked up at CALL time (so tests can stub it). */
  fetch?: typeof fetch;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions<T> {
  method?: HttpMethod;
  /** Appended as ?key=value. undefined and null values are skipped. */
  query?: Record<string, string | number | null | undefined>;
  /** Serialized as JSON when present. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Validates the JSON response. Without it the parsed JSON is returned as-is. */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T>;
}

/**
 * TODO(1): a typed fetch wrapper. The ONLY code in the app that touches fetch
 * and Response. Everything above it deals in typed data and ApiError.
 *
 * request(path, options):
 *  - URL: baseUrl (without trailing slash) + path, plus `query` params
 *    (skip undefined/null). Method defaults to GET.
 *  - Always send `Accept: application/json` and any `headers` given.
 *    If `body` is present: JSON.stringify it and set `Content-Type: application/json`.
 *    No body -> no Content-Type. Pass `signal` through.
 *  - fetch rejects:
 *      AbortError        -> rethrow it unchanged (TanStack Query cancels requests)
 *      anything else     -> ApiError { kind: "network", message: "Network error: could not reach the server" }
 *  - non-2xx response -> ApiError { kind: "http", status }:
 *      JSON body matching ProblemSchema (../schemas/task) ->
 *        message   = problem.detail ?? problem.title ?? fallback
 *        fieldErrors from problem.errors: pointer "/title" -> key "title"
 *        problem   = the parsed problem
 *      anything else -> message "Request failed with status <status>" (the fallback)
 *  - 204 -> resolve undefined
 *  - 2xx: parse JSON (not JSON -> ApiError invalid_response); if `schema` is given,
 *    safeParse it (mismatch -> ApiError { kind: "invalid_response",
 *    message: "Unexpected response from server" }) and return the parsed data.
 *
 * See ./errors.ts for ApiError.
 */
export function createApiClient(_options: ApiClientOptions): ApiClient {
  return {
    async request() {
      throw new Error("Not implemented: TODO(1) ApiClient.request");
    },
  };
}
