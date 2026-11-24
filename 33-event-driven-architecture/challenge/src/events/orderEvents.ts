import { z } from "zod";
import type { BusMessage } from "./eventBus.js";

/**
 * The OrderPlaced contract, in every version that may still exist in the topic.
 *
 * History:
 *  - v1 (until last month): a flat `totalCents`, implicitly EUR.
 *  - v2 (current): `total: { amountCents, currency }` so we can sell in other currencies.
 *
 * Kafka keeps 30 days of orders.v1, so v1 records are still in the topic and
 * any consumer that replays or lags behind WILL see them.
 */

export const HEADERS = {
  type: "event-type",
  version: "event-version",
  id: "event-id",
  contentType: "content-type",
} as const;

export const ORDER_PLACED = "OrderPlaced";
export const ORDER_PLACED_LATEST_VERSION = "2";

export const orderPlacedV1Schema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  totalCents: z.number().int().positive(),
});
export type OrderPlacedV1 = z.infer<typeof orderPlacedV1Schema>;

export const orderPlacedV2Schema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  total: z.object({
    amountCents: z.number().int().positive(),
    currency: z.string().length(3),
  }),
});
export type OrderPlacedV2 = z.infer<typeof orderPlacedV2Schema>;

/** What consumers work with: always the latest version. */
export type OrderPlaced = OrderPlacedV2;

/** Builds the Kafka record for an OrderPlaced (latest version). Keyed by orderId. */
export function orderPlacedMessage(event: OrderPlacedV2): BusMessage {
  return {
    key: event.orderId,
    value: JSON.stringify(event),
    headers: {
      [HEADERS.type]: ORDER_PLACED,
      [HEADERS.version]: ORDER_PLACED_LATEST_VERSION,
      [HEADERS.id]: event.eventId,
      [HEADERS.contentType]: "application/json",
    },
  };
}
