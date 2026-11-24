import type { Price, Product, ReviewSummary } from "../domain/product.js";

/**
 * Ports for the three downstream services. The service layer depends on these
 * interfaces only. Every method takes an AbortSignal: if the caller gives up
 * (timeout), the implementation must stop the work (pass it to fetch).
 *
 * Expected errors:
 *   NotFoundError    the product doesn't exist (catalog)
 *   DownstreamError  the service answered 5xx/429 or the connection failed
 */
export interface CatalogClient {
  getProduct(id: string, signal: AbortSignal): Promise<Product>;
}

export interface PricingClient {
  getPrice(id: string, signal: AbortSignal): Promise<Price>;
}

export interface ReviewsClient {
  getReviews(id: string, signal: AbortSignal): Promise<ReviewSummary>;
}

export interface Downstreams {
  catalog: CatalogClient;
  pricing: PricingClient;
  reviews: ReviewsClient;
}
