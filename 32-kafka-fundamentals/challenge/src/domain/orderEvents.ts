import { z } from "zod";

/**
 * The order-events contract. Producers and consumers both depend on THIS file,
 * never on each other. In a bigger company this would live in a shared schema
 * registry or package (more on schema evolution in module 33).
 *
 * All amounts are integer cents in a single currency (EUR) to keep the
 * projection simple.
 */

/** Header names carried by every order event record. */
export const HEADERS = {
  type: "event-type",
  version: "event-version",
  id: "event-id",
  contentType: "content-type",
} as const;

/** The schema version these types describe. Bump it on breaking changes. */
export const ORDER_EVENT_VERSION = "1";

export const ORDER_EVENT_TYPES = ["OrderPlaced", "OrderCancelled"] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

const common = {
  /** Unique per event. Consumers use it to detect duplicates. */
  eventId: z.string().min(1),
  /** ISO-8601 timestamp of when the thing happened (not when it was published). */
  occurredAt: z.iso.datetime(),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
};

export const orderPlacedSchema = z.object({
  type: z.literal("OrderPlaced"),
  ...common,
  totalCents: z.number().int().nonnegative(),
});

export const orderCancelledSchema = z.object({
  type: z.literal("OrderCancelled"),
  ...common,
  /** Amount refunded to the customer. */
  totalCents: z.number().int().nonnegative(),
  reason: z.string().min(1),
});

/** A complete event, exactly as it travels on the wire (the record value). */
export const orderEventSchema = z.discriminatedUnion("type", [orderPlacedSchema, orderCancelledSchema]);
export type OrderEvent = z.infer<typeof orderEventSchema>;
export type OrderPlaced = z.infer<typeof orderPlacedSchema>;
export type OrderCancelled = z.infer<typeof orderCancelledSchema>;

/**
 * What application code hands to the producer: eventId and occurredAt are
 * optional and get filled in by the producer when missing. Passing your own
 * eventId is how you make a *retried* publish recognisable as a duplicate.
 */
const inputOverrides = {
  eventId: z.string().min(1).optional(),
  occurredAt: z.iso.datetime().optional(),
};
export const orderEventInputSchema = z.discriminatedUnion("type", [
  orderPlacedSchema.extend(inputOverrides),
  orderCancelledSchema.extend(inputOverrides),
]);
export type OrderEventInput = z.input<typeof orderEventInputSchema>;
