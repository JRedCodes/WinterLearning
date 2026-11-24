# WebSockets and SSE, one level deeper

The lesson covers what you need to build the challenge. This page is for when you're debugging something odd in production, or an interviewer keeps asking "and then what happens?".

## The handshake, step by step

1. The client opens a TCP connection (plus TLS for `wss://`) to the server.
2. It sends an HTTP/1.1 `GET` with `Upgrade: websocket`, `Connection: Upgrade`, `Sec-WebSocket-Version: 13` and a random 16-byte base64 `Sec-WebSocket-Key`. Browsers also send `Origin` and any cookies for the domain.
3. The server checks whatever it wants (path, auth, origin, rate limits) and either answers with a normal HTTP response (`401`, `403`, `404`, `429`...) or with `101 Switching Protocols`.
4. `Sec-WebSocket-Accept` = base64(SHA-1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")). This only proves the server speaks WebSocket and that no caching proxy replayed an old response. It's **not** authentication.
5. From now on, both sides speak the framing protocol on the same TCP connection.

Optional negotiation in the handshake:

- `Sec-WebSocket-Protocol`: subprotocols (`graphql-transport-ws`, `mqtt`, your own `chat.v2`). The server picks one. A good way to version your message protocol.
- `Sec-WebSocket-Extensions: permessage-deflate`: compression. Saves bandwidth for JSON, costs CPU and **memory per connection** (zlib contexts). `ws` disables it on the server by default for that reason. Measure before enabling it with 100k connections.

### Over HTTP/2 and HTTP/3

RFC 8441 (and RFC 9220 for HTTP/3) define WebSockets over a single HTTP/2 stream with an extended `CONNECT`. Browsers and some proxies support it, but most Node servers still terminate WebSockets on HTTP/1.1. SSE, on the other hand, gets HTTP/2 for free: many streams share one connection, which removes the ~6-connections-per-domain limit browsers apply on HTTP/1.1.

## Frames

Every frame has a small header:

```
FIN | RSV1-3 | opcode (4 bits) | MASK | payload length (7, 7+16 or 7+64 bits) | [masking key] | payload
```

- **FIN + continuation frames**: a large message can be split into fragments. Libraries reassemble them; your `message` handler sees one complete message.
- **Masking**: frames from client to server are XOR-masked with a random key. This exists to stop a malicious page from crafting bytes that confuse intermediary caches. Servers must reject unmasked client frames (`ws` does).
- **Control frames** (close, ping, pong) are at most 125 bytes and can be interleaved between fragments of a data message.

## The close handshake

1. Side A sends a close frame with a code and optional reason.
2. Side B answers with its own close frame.
3. The server closes the TCP connection.

If B never answers (because it's dead), A waits. `ws` gives up after 30 seconds and destroys the socket. That's why the heartbeat uses `terminate()` for unresponsive peers, and why the challenge's `close()` force-terminates stragglers after a short grace period.

**1006 is never sent.** It's the code your `close` handler sees when the connection ended without a close frame: the TCP connection dropped, the process was killed, or you called `terminate()`.

## Choosing close codes

| Range | Use |
|---|---|
| 1000–1015 | Defined by the RFC (see the table in the lesson) |
| 3000–3999 | Registered with IANA for libraries and frameworks |
| 4000–4999 | **Yours**: application-specific codes, e.g. 4001 "token expired", 4003 "kicked from room" |

Clients should treat codes differently: reconnect immediately after `1001` (deploy), back off after `1013` (overload), and *not* reconnect after `4001` until they've refreshed their token.

## Reconnecting clients

A browser `WebSocket` does not reconnect. A robust client:

```ts
let attempt = 0;
function connect() {
  const ws = new WebSocket(url());
  ws.onopen = () => { attempt = 0; ws.send(JSON.stringify({ type: "join", room, afterId: lastSeenId })); };
  ws.onmessage = (e) => handle(JSON.parse(e.data)); // update lastSeenId, drop duplicates
  ws.onclose = (e) => {
    if (e.code === 4001) return refreshTokenThenConnect();
    const delay = Math.min(30_000, 500 * 2 ** attempt++) * (0.5 + Math.random()); // backoff + jitter
    setTimeout(connect, delay);
  };
}
```

Without the jitter, every client that was on a pod you just restarted reconnects on the same schedule, so they arrive in synchronized waves.

## SSE wire format details

```
retry: 2000
: this is a comment, ignored by EventSource

id: 17
event: message
data: {"text":"line one"}

data: a multi-line payload
data: is sent as several data: lines

```

- Events are separated by a blank line (`\n\n`). Fields are `field: value`; a single space after the colon is stripped.
- `event:` sets the event type (`addEventListener("message", ...)` receives untyped events *and* `event: message`).
- `id:` sets the stream's last event id. On reconnect the browser sends it as the `Last-Event-ID` request header. An event without `id:` keeps the previous one, which is why the challenge gives presence events no id: they shouldn't move the resume point.
- `retry:` sets the reconnect delay in milliseconds.
- The response must be `Content-Type: text/event-stream`. If the server answers with a non-200 status or another content type, EventSource stops reconnecting for good.
- Compression middleware and buffering proxies are the most common reason "SSE works locally but events arrive in bursts in production". Disable buffering (`X-Accel-Buffering: no` for nginx, `Cache-Control: no-transform`) and flush headers immediately.

The browser `EventSource` can't set custom headers (no `Authorization`), so SSE auth usually rides on cookies. If you need bearer tokens, use `fetch()` with a streaming body reader (that's what the challenge's tests do) or a small library that wraps it.
