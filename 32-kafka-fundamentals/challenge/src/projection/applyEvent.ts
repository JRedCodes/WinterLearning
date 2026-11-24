import type { CustomerTotals } from "../domain/customerTotals.js";
import type { OrderEvent } from "../domain/orderEvents.js";

/**
 * TODO(3): the projection's business rule, as a PURE function.
 *
 * Given the current totals of a customer (undefined = first event for them)
 * and one event, return the NEW totals. Don't mutate `current`.
 *
 *  - First event for a customer: start from zero counts, netTotalCents 0.
 *  - OrderPlaced:    placedCount + 1,    netTotalCents + totalCents
 *  - OrderCancelled: cancelledCount + 1, netTotalCents - totalCents
 *  - lastEventAt: the LATER of current.lastEventAt and event.occurredAt
 *    (events can arrive out of time order across partitions!)
 *  - If current belongs to a different customer than the event, throw.
 *  - Use an exhaustive switch on event.type (a `never` check in default) so
 *    adding an event type later is a compile error here.
 */
export function applyEvent(current: CustomerTotals | undefined, event: OrderEvent): CustomerTotals {
  throw new Error("Not implemented: TODO(3)");
}
