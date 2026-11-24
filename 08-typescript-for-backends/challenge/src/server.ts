import { randomUUID } from "node:crypto";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { systemClock } from "./lib/clock.js";
import { OrderId, Sku, UserId } from "./domain/ids.js";
import { cents } from "./domain/money.js";
import { CarrierClient } from "./integrations/carrierClient.js";
import { createFetchTransport } from "./integrations/fetchTransport.js";
import { InMemoryCatalog } from "./repositories/catalog.js";
import { InMemoryOrderRepository } from "./repositories/orderRepository.js";
import { InMemoryUserDirectory } from "./repositories/userDirectory.js";
import { OrderService } from "./services/orderService.js";

// Composition root: the one place that knows about concrete implementations.
const config = loadConfig();

const orderService = new OrderService({
  orders: new InMemoryOrderRepository(),
  catalog: new InMemoryCatalog([
    { sku: Sku("MUG-0001"), name: "Logo mug", priceCents: cents(1299), weightGrams: 350 },
    { sku: Sku("TEE-0002"), name: "T-shirt", priceCents: cents(1999), weightGrams: 200 },
  ]),
  carrier: new CarrierClient(createFetchTransport(config.carrierBaseUrl)),
  clock: systemClock,
  newOrderId: () => OrderId(`ord_${randomUUID()}`),
});

const users = new InMemoryUserDirectory([
  { id: UserId("u_alice"), name: "Alice", role: "customer" },
  { id: UserId("u_wendy"), name: "Wendy", role: "warehouse" },
]);

const server = createApp({ orderService, users }).listen(config.port, () => {
  console.log(`orders api listening on http://localhost:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
