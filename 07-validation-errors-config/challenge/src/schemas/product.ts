import { z } from "zod";
import type { NewProductInput, ProductPatch, ProductQuery } from "../services/productService.js";

/**
 * TODO(2): Zod schemas for every input the API accepts.
 *
 * Each schema's OUTPUT must match the service's input type. Keep the
 * `satisfies z.ZodType<...>` (or the type annotation) so the compiler checks it.
 *
 * createProductSchema (POST /products body)
 *   sku         string, trimmed, UPPERCASED, then must match /^[A-Z0-9-]{3,32}$/
 *   name        string, trimmed, 1–120 chars
 *   category    string, trimmed, lowercased, 1–50 chars
 *   priceCents  integer ≥ 0 (a number in JSON, NOT a string)
 *   stock       integer ≥ 0, default 0
 *   tags        array of trimmed non-empty strings (≤ 30 chars each), max 10, default []
 *   Unknown keys (e.g. "id", "createdAt") are stripped, never passed on.
 *
 * updateProductSchema (PATCH /products/:id body)
 *   name, category, priceCents, tags: same rules, all optional. sku and stock
 *   can NOT be patched (strip them). At least one field must be present:
 *   otherwise one issue with message "provide at least one field to update".
 *
 * productParamsSchema (:id)
 *   id: string matching /^prd_[A-Za-z0-9]+$/
 *
 * reserveSchema (POST /products/:id/reserve body)
 *   quantity: integer 1–1000
 *
 * makeListProductsQuerySchema({ defaultLimit, maxLimit }) (GET /products query)
 *   Query values arrive as STRINGS, so coerce:
 *   page           integer ≥ 1, default 1
 *   limit          integer 1–maxLimit, default defaultLimit
 *   category       optional string, trimmed, lowercased
 *   minPriceCents  optional integer ≥ 0
 *   maxPriceCents  optional integer ≥ 0
 *   inStock        optional boolean from "true"/"false" (careful: z.coerce.boolean() turns "false" into true!)
 *   Cross-field rule: minPriceCents ≤ maxPriceCents when both are given;
 *   report the issue on path ["minPriceCents"].
 *
 * The placeholders below accept anything, which is why the tests fail.
 */

export const createProductSchema: z.ZodType<NewProductInput> = z.any();

export const updateProductSchema: z.ZodType<ProductPatch> = z.any();

export const productParamsSchema: z.ZodType<{ id: string }> = z.any();

export const reserveSchema: z.ZodType<{ quantity: number }> = z.any();

export function makeListProductsQuerySchema(_opts: { defaultLimit: number; maxLimit: number }): z.ZodType<ProductQuery> {
  return z.any();
}
