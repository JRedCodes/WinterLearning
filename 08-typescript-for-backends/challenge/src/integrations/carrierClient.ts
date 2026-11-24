/**
 * Client for the shipping carrier's HTTP API (see "Carrier API reference"
 * in CHALLENGE.md for the documented request/response bodies).
 *
 * The transport does the actual HTTP call. It's injected so tests can
 * replace the network with canned responses.
 */
export type CarrierTransport = (path: string, body: unknown) => Promise<any>;

export class CarrierClient {
  constructor(private readonly transport: CarrierTransport) {}

  async quote(req: { country: string; weightGrams: number }) {
    const data = await this.transport("/v2/quotes", {
      destination_country: req.country,
      weight_grams: req.weightGrams,
    });
    return { service: data.service, amountCents: data.amount_cents };
  }

  async createShipment(req: { orderId: string; country: string; weightGrams: number }) {
    const data = await this.transport("/v2/shipments", {
      reference: req.orderId,
      destination_country: req.country,
      weight_grams: req.weightGrams,
    });
    return { carrier: data.carrier, trackingNumber: data.trackingNumber, etaDays: data.eta_days };
  }
}
