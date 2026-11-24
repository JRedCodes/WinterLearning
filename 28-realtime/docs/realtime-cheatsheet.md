# Real-time cheat sheet

## `ws` server

```ts
import { WebSocketServer, type WebSocket, type RawData } from "ws";

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on("upgrade", (req, socket, head) => {
  if (!ok(req)) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req));
});

ws.on("message", (data: RawData, isBinary: boolean) => {});
ws.on("pong", () => {});
ws.on("close", (code: number, reason: Buffer) => {});
ws.on("error", (err) => {});

ws.send(JSON.stringify(msg));   // queue a text frame
ws.bufferedAmount;              // bytes queued but not yet written to the socket
ws.readyState;                  // 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED
ws.ping();                      // peer must answer with a pong
ws.close(1001, "going away");   // polite: close handshake
ws.terminate();                 // brutal: destroy the socket now
wss.clients;                    // Set of open sockets (clientTracking default true)
```

## `ws` client (Node, tests)

```ts
import WebSocket from "ws";
const ws = new WebSocket("ws://localhost:3000/ws?token=...");
ws.on("open", () => ws.send(JSON.stringify({ type: "join", room: "general" })));
ws.on("message", (data) => console.log(JSON.parse(String(data))));
ws.on("unexpected-response", (_req, res) => console.log("rejected", res.statusCode));
new WebSocket(url, { autoPong: false }); // simulate a dead peer that never answers pings
```

## Browser

```ts
const ws = new WebSocket(`wss://${location.host}/ws?token=${ticket}`);
ws.onmessage = (e) => handle(JSON.parse(e.data));
ws.onclose = (e) => scheduleReconnect(e.code);   // no automatic reconnect!

const es = new EventSource("/rooms/general/events");          // auto reconnect + Last-Event-ID
es.addEventListener("message", (e) => handle(JSON.parse(e.data)));
es.addEventListener("presence", (e) => showPresence(JSON.parse(e.data)));
```

## SSE from Express

```ts
res.status(200).set({
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
});
res.flushHeaders();
res.write("retry: 2000\n\n");
res.write(`id: ${m.id}\nevent: message\ndata: ${JSON.stringify(m)}\n\n`);
res.write(": keep-alive\n\n");
req.on("close", cleanup);
const lastId = req.get("last-event-id");
```

## Redis pub/sub (ioredis)

```ts
const pub = new Redis(url);
const sub = pub.duplicate();               // subscriber needs its own connection
await sub.subscribe("wl:28:events");       // resolves once subscribed
sub.on("message", (channel, payload) => {});
await pub.publish("wl:28:events", JSON.stringify(evt)); // → number of receivers
await sub.unsubscribe("wl:28:events");
```

```bash
redis-cli -p 6380 PUBSUB CHANNELS 'wl:28:*'     # active channels
redis-cli -p 6380 PUBSUB NUMSUB wl:28:events    # subscribers per channel
redis-cli -p 6380 SUBSCRIBE wl:28:events        # watch live traffic
redis-cli -p 6380 -n 12 LRANGE wl:28:room:general:history 0 -1
```

## Close codes

| Code | Meaning |
|---|---|
| 1000 | normal |
| 1001 | going away (deploy, tab closed) |
| 1006 | abnormal: observed, never sent |
| 1008 | policy violation (auth) |
| 1009 | message too big |
| 1011 | server error |
| 1013 | try again later (overload, slow consumer) |
| 4000–4999 | application-defined |

## Decision table

| Need | Pick |
|---|---|
| Server → client updates, browser, HTTP auth | SSE |
| Two-way, low latency, many small messages | WebSocket |
| Updates every 30s+ are fine | polling |
| Mobile app in background | push notifications (APNs/FCM), not sockets |
| Must not lose messages | durable log + ids + resume, whatever the transport |
