import { DownstreamError, NotFoundError } from "../domain/errors.js";
import type { Price, Product, ReviewSummary, ServiceName } from "../domain/product.js";
import type { CatalogClient, PricingClient, ReviewsClient } from "./clients.js";

/**
 * What real clients look like: fetch with the caller's AbortSignal, and HTTP
 * statuses translated into domain errors so the resilience layer can tell
 * "retry this" (5xx, 429, network) from "don't" (404).
 * Not used by the tests; server.ts uses them when *_URL env vars are set.
 */
async function getJson<T>(service: ServiceName, url: string, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (err) {
    if (signal.aborted) throw signal.reason; // our own timeout: surface the TimeoutError
    throw new DownstreamError(service, 0, `${service} unreachable: ${String(err)}`);
  }
  if (res.status === 404) throw new NotFoundError("Product");
  if (!res.ok) throw new DownstreamError(service, res.status);
  return (await res.json()) as T;
}

export function httpCatalog(baseUrl: string): CatalogClient {
  return { getProduct: (id, signal) => getJson<Product>("catalog", `${baseUrl}/products/${encodeURIComponent(id)}`, signal) };
}

export function httpPricing(baseUrl: string): PricingClient {
  return { getPrice: (id, signal) => getJson<Price>("pricing", `${baseUrl}/prices/${encodeURIComponent(id)}`, signal) };
}

export function httpReviews(baseUrl: string): ReviewsClient {
  return {
    getReviews: (id, signal) => getJson<ReviewSummary>("reviews", `${baseUrl}/reviews/${encodeURIComponent(id)}/summary`, signal),
  };
}
