// A throwaway payments service for manual testing: `make fake-payments`.
// Approves everything except card numbers ending in 0000. Prints the trace
// headers it receives so you can watch propagation work.
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.FAKE_PAYMENTS_PORT ?? 4001);

http
  .createServer((req, res) => {
    console.log(`${req.method} ${req.url} traceparent=${req.headers.traceparent ?? "-"} x-request-id=${req.headers["x-request-id"] ?? "-"}`);
    if (req.url === "/health") return void res.writeHead(200).end("ok");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { cardNumber } = JSON.parse(body || "{}") as { cardNumber?: string };
      if (cardNumber?.endsWith("0000")) return void res.writeHead(402).end();
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ authorizationId: randomUUID() }));
    });
  })
  .listen(port, () => console.log(`fake payments on http://localhost:${port}`));
