import { DownstreamError, NotFoundError } from "../domain/errors.js";
import type { ServiceName } from "../domain/product.js";
import type { Downstreams } from "./clients.js";

export interface FaultProfile {
  /** Typical latency in ms. */
  latencyMs: number;
  /** 0..1: chance a call fails with a 503. */
  failureRate: number;
  /** 0..1: chance a call takes 20x longer (a "latency spike"). */
  slowRate: number;
}

/**
 * Flaky in-process fakes for `npm run dev`, so you can watch timeouts,
 * retries, breakers and bulkheads work without running three more services.
 * Tune with env vars (see .env.example).
 */
export function simulatedDownstreams(faults: Record<ServiceName, FaultProfile>, random = Math.random): Downstreams {
  const simulate = <T>(service: ServiceName, signal: AbortSignal, value: () => T): Promise<T> => {
    const f = faults[service];
    const latency = f.latencyMs * (random() < f.slowRate ? 20 : 1) * (0.5 + random());
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (random() < f.failureRate) return reject(new DownstreamError(service, 503));
        try {
          resolve(value());
        } catch (err) {
          reject(err);
        }
      }, latency);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    });
  };

  return {
    catalog: {
      getProduct: (id, signal) =>
        simulate("catalog", signal, () => {
          if (!/^p-\d+$/.test(id)) throw new NotFoundError("Product");
          return { id, name: `Product ${id}`, description: "A very fine product." };
        }),
    },
    pricing: { getPrice: (_id, signal) => simulate("pricing", signal, () => ({ amount: 1999, currency: "EUR" })) },
    reviews: { getReviews: (_id, signal) => simulate("reviews", signal, () => ({ average: 4.4, count: 132 })) },
  };
}
