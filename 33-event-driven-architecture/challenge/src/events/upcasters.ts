import type { OrderPlaced } from "./orderEvents.js";

/**
 * Upcasting: turning an old version of an event into the current shape, so
 * the rest of the consumer only ever deals with ONE version.
 *
 * Ticket SHOP-412 ("support OrderPlaced v1 in consumers after the v2 rollout")
 * is still open. Nobody has written this yet.
 */
export function upcastOrderPlaced(version: string | undefined, payload: unknown): OrderPlaced {
  throw new Error("upcastOrderPlaced is not implemented yet (SHOP-412)");
}
