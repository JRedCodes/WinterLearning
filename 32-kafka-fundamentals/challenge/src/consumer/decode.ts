import { HEADERS, ORDER_EVENT_TYPES, ORDER_EVENT_VERSION, orderEventSchema, type OrderEvent } from "../domain/orderEvents.js";
import type { ConsumedMessage } from "../messaging/types.js";

export type DecodeResult = { ok: true; event: OrderEvent } | { ok: false; reason: string };

/**
 * TODO(4): raw record → validated OrderEvent (or a reason why not).
 *
 * This function must NEVER throw. A bad record is data to report, not a crash.
 * Check in this order and return { ok: false, reason } at the first problem:
 *
 *  1. event-type header missing                    → reason mentions "missing"
 *  2. event-type not in ORDER_EVENT_TYPES          → reason mentions "unknown"
 *  3. event-version header !== ORDER_EVENT_VERSION → reason mentions "unsupported"
 *  4. value is null (a tombstone)                  → reason mentions "empty"
 *  5. value isn't valid JSON                       → reason mentions "JSON"
 *  6. orderEventSchema rejects it                  → reason mentions "schema"
 *  7. event-type header ≠ payload "type"           → reason mentions "match"
 *
 * Otherwise return { ok: true, event }.
 */
export function decodeOrderEvent(message: ConsumedMessage): DecodeResult {
  return { ok: false, reason: "Not implemented: TODO(4)" };
}
