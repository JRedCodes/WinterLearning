# Graceful shutdown in Node, in depth

## What `server.close()` actually does

`http.Server#close(callback)`:

1. Closes the **listening** socket immediately. New TCP connections are refused (`ECONNREFUSED`).
2. Does **not** touch existing connections. The callback fires only once every existing connection has closed.

Since Node 19, `close()` also calls `closeIdleConnections()` once, at the moment you call it. That handles sockets that are idle *right then*. It doesn't handle a keep-alive socket that is busy now and becomes idle a second later: that socket will happily sit open until the keep-alive timeout (5s by default in Node, often 60s+ behind load balancers). Your drain waits for it.

Two helpers exist:

- `server.closeIdleConnections()`: closes connections that have no request in progress.
- `server.closeAllConnections()`: destroys **every** connection, in-flight or not. That's your "drain timeout reached" hammer.

## Tracking connections yourself

To end a busy keep-alive socket as soon as its response is done, you need to know which sockets have requests in flight. The pattern:

```ts
const inFlight = new Map<Socket, number>();

server.on("connection", (socket) => {
  inFlight.set(socket, 0);
  socket.once("close", () => inFlight.delete(socket));
});

server.on("request", (req, res) => {
  const socket = req.socket;
  inFlight.set(socket, (inFlight.get(socket) ?? 0) + 1);
  res.once("finish", () => {
    const n = inFlight.get(socket)! - 1;
    inFlight.set(socket, n);
    if (draining && n === 0) socket.end();
  });
});
```

Register this `request` listener **before** your app's listener, so you can still add headers before the app writes its response.

## `Connection: close`

HTTP/1.1 keeps connections open by default. Setting `Connection: close` on a response tells the client "don't send another request on this socket", and Node closes the socket after the response. During draining, set it on:

- every **new** request that arrives on an existing keep-alive socket, and
- every in-flight response whose headers haven't been sent yet (keep a `Set<ServerResponse>`).

Clients and proxies then open a new connection, which lands on a healthy instance.

## The deadline

```text
platform grace period  ─────────────────────────────────────────┐ SIGKILL
drain timeout          ──────────────────────┐ destroy sockets  │
hooks (pool.end, ...)                         ├──┐              │
                                              exit ✓            │
```

`drainTimeoutMs + time for hooks < grace period`, with margin. In compose that's `stop_grace_period`, in Kubernetes `terminationGracePeriodSeconds` (default 30s).

Use `timer.unref()` on the drain timer so it doesn't keep the process alive by itself, and `clearTimeout` it when the drain finishes early.

## Order of cleanup

1. HTTP server (stop new work, finish current work)
2. Background consumers (stop pulling jobs or messages, finish current ones; see module 20)
3. Outgoing resources: DB pool (`pool.end()` waits for checked-out clients to be released), Redis (`quit()`), Kafka producer (`disconnect()` flushes)
4. Flush telemetry (logs, traces) last, so the shutdown itself is recorded

Each hook in its own `try/catch`. A Redis that's already gone must not prevent the pool from closing.

## Idempotency and double signals

- SIGTERM from the orchestrator *and* SIGINT from a developer, or two SIGTERMs, are both realistic. `shutdown()` should return the same promise on every call.
- A **second** signal while already shutting down means "I'm done waiting": exit immediately with code 1.

## Exit codes

- `0`: clean shutdown.
- `1`: something was forced or failed. Platforms record it, and you can alert on a rising rate of forced shutdowns, which usually means slow requests or a too-short timeout.
- Avoid calling `process.exit()` deep inside your code. Do it in one place (the signal handler) after cleanup.

## Kubernetes extras (preview of module 35)

When a pod is deleted, Kubernetes sends SIGTERM and removes the pod from Service endpoints **at the same time**. Proxies take a moment to notice, so for a second or two, new requests may still arrive *after* SIGTERM. Common mitigations:

- a `preStop` hook with `sleep 5`, which delays SIGTERM until endpoints have updated, or
- on SIGTERM, fail readiness and keep serving for a few seconds before calling `server.close()`.

The lifecycle you build in this module is the foundation either way.
