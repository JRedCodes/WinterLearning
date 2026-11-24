import type { CarrierTransport } from "./carrierClient.js";

/** The real transport: POSTs JSON to the carrier and returns the parsed body. */
export function createFetchTransport(baseUrl: string): CarrierTransport {
  return async (path, body) => {
    const res = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    return res.json();
  };
}
