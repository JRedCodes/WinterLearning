import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { Downstreams } from "./downstream/clients.js";
import { httpCatalog, httpPricing, httpReviews } from "./downstream/httpClients.js";
import { simulatedDownstreams } from "./downstream/simulated.js";
import { defaultPolicies } from "./policies.js";
import { ProductOverviewService } from "./services/productOverviewService.js";

/**
 * Composition root. With no *_URL env vars it uses simulated flaky
 * downstreams, so `npm run dev` + `curl` (or k6/load.js) shows the
 * resilience patterns at work.
 */
const config = loadConfig();
const simulated = simulatedDownstreams(config.faults);
const downstreams: Downstreams = {
  catalog: config.urls.catalog ? httpCatalog(config.urls.catalog) : simulated.catalog,
  pricing: config.urls.pricing ? httpPricing(config.urls.pricing) : simulated.pricing,
  reviews: config.urls.reviews ? httpReviews(config.urls.reviews) : simulated.reviews,
};

const overview = new ProductOverviewService({ downstreams, policies: defaultPolicies });
const app = createApp({ overview });

const server = app.listen(config.port, () => {
  console.log(`aggregator listening on http://localhost:${config.port}`);
  console.log(`try: curl -s localhost:${config.port}/products/p-1/overview`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
