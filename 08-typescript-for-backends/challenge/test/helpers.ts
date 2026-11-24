import { createApp } from "../src/app.js";
import { OrderId, Sku, UserId } from "../src/domain/ids.js";
import { cents } from "../src/domain/money.js";
import { CarrierClient } from "../src/integrations/carrierClient.js";
import { InMemoryCatalog } from "../src/repositories/catalog.js";
import { InMemoryOrderRepository } from "../src/repositories/orderRepository.js";
import { InMemoryUserDirectory } from "../src/repositories/userDirectory.js";
import { OrderService } from "../src/services/orderService.js";

export const ALICE = "u_alice";
export const BOB = "u_bob";
export const WENDY = "u_wendy"; // warehouse staff

export const NOW = new Date("2026-03-02T10:00:00.000Z");

/** Exactly what the carrier's API documentation says it returns. */
export const QUOTE_RESPONSE = { service: "standard", amount_cents: "499", currency: "EUR" };
export const SHIPMENT_RESPONSE = { tracking_number: "1Z999AA10123456784", carrier: "ups", eta_days: 3 };

export interface CarrierCall {
  path: string;
  body: unknown;
}

/**
 * Builds the app with in-memory repositories, a frozen clock and a fake
 * carrier. `carrier.responses` can be overwritten per test to simulate a
 * misbehaving carrier.
 */
export function buildTestApp() {
  const calls: CarrierCall[] = [];
  const responses: Record<string, unknown> = {
    "/v2/quotes": QUOTE_RESPONSE,
    "/v2/shipments": SHIPMENT_RESPONSE,
  };
  const transport = async (path: string, body: unknown): Promise<unknown> => {
    calls.push({ path, body });
    return structuredClone(responses[path]);
  };

  let seq = 0;
  const orderService = new OrderService({
    orders: new InMemoryOrderRepository(),
    catalog: new InMemoryCatalog([
      { sku: Sku("MUG-0001"), name: "Logo mug", priceCents: cents(1299), weightGrams: 350 },
      { sku: Sku("TEE-0002"), name: "T-shirt", priceCents: cents(1999), weightGrams: 200 },
    ]),
    carrier: new CarrierClient(transport),
    clock: { now: () => NOW },
    newOrderId: () => OrderId(`ord_${++seq}`),
  });

  const users = new InMemoryUserDirectory([
    { id: UserId(ALICE), name: "Alice", role: "customer" },
    { id: UserId(BOB), name: "Bob", role: "customer" },
    { id: UserId(WENDY), name: "Wendy", role: "warehouse" },
  ]);

  return { app: createApp({ orderService, users }), carrier: { calls, responses } };
}
