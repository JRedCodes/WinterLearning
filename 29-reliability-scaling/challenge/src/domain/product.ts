/** Domain types for the product page. No Express, no HTTP clients in here. */

export interface Product {
  id: string;
  name: string;
  description: string;
}

export interface Price {
  /** Minor units (cents). Never floats for money. */
  amount: number;
  currency: string;
}

export interface ReviewSummary {
  average: number;
  count: number;
}

/** The downstream services the aggregator depends on. */
export type ServiceName = "catalog" | "pricing" | "reviews";

export interface ProductOverview {
  product: Product;
  /** `stale: true` = served from the last-known-good cache because pricing failed. null = no price available. */
  price: (Price & { stale: boolean }) | null;
  /** null = reviews unavailable right now. */
  reviews: ReviewSummary | null;
}

export interface OverviewResult {
  data: ProductOverview;
  /** True when any part of the response is missing or stale. */
  degraded: boolean;
  /** Services whose live call failed for this request, in the order catalog, pricing, reviews. */
  unavailable: ServiceName[];
}
