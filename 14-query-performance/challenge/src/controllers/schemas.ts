import { z } from "zod";

export const IdParams = z.object({ id: z.string().regex(/^[1-9]\d{0,17}$/, "must be a positive integer id") });

export const LookupQuery = z.object({ email: z.string().trim().min(3).max(254) });

export const LimitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const FeedQuery = LimitQuery.extend({
  cursor: z.string().min(1).max(500).optional(),
});
