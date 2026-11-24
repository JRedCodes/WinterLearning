# Scaling real-time systems

The challenge runs two instances that share Redis. This page is about what changes at 10x and 100x that, and how to talk about it in a system design interview.

## What limits one instance

| Resource | Why it matters | Rough numbers |
|---|---|---|
| Memory per connection | `ws` socket objects, TLS state, your per-connection state, send buffers | tens of KB idle; much more if buffers fill |
| File descriptors | one per socket | raise `ulimit -n` (often 1024 by default) |
| CPU for fan-out | a message to a room of 10,000 is 10,000 `send()` calls plus JSON serialization | serialize **once** per message, not once per recipient |
| Event loop | blocking work delays every connection's heartbeat | keep handlers small; offload heavy work to queues |

Node handles tens of thousands of mostly idle WebSockets per process comfortably. The usual bottleneck is fan-out to large rooms, not the connection count itself.

## Fan-out strategies across instances

### 1. Broadcast everything (what the challenge does)

Every instance subscribes to one channel and receives every event, then drops events for rooms with no local members.

- ✅ Trivial, no coordination, no routing state.
- ❌ Every instance processes 100% of traffic. With N instances, Redis sends every message N times. Works up to a few thousand messages per second.

### 2. Subscribe per room

An instance subscribes to `chat:room:<id>` when its first local member joins and unsubscribes when the last leaves.

- ✅ Instances only receive traffic they need.
- ❌ More subscription churn; you must handle the race between "unsubscribe" and "someone joins again". Redis Cluster's classic pub/sub broadcasts across all shards; **sharded pub/sub** (`SSUBSCRIBE`/`SPUBLISH`, Redis 7+) keeps a channel on one shard.

### 3. Route to the right gateway

Keep a registry of which gateway holds which user (`user:alice → gateway-17`). To deliver, look up the gateway and send directly (gRPC, or a per-gateway queue).

- ✅ Scales to millions of connections, works well for 1:1 messaging (WhatsApp-style).
- ❌ The registry must be kept fresh as connections come and go, which means heartbeats and expiry all over again.

### 4. A durable log in the middle

Publish to Kafka (module 32) or Redis Streams instead of pub/sub. Gateways consume, and history, search indexing and push notifications are just more consumers of the same log.

- ✅ Replay, at-least-once delivery, decoupled consumers.
- ❌ More latency and more infrastructure. Per-room ordering needs partitioning by room id.

## Pub/sub vs Streams vs Kafka

| | Redis pub/sub | Redis Streams | Kafka |
|---|---|---|---|
| Persistence | none | yes (capped with MAXLEN) | yes (retention by time/size) |
| Missed while offline | lost | read later with last id | read later with offset |
| Consumer groups | no | yes | yes |
| Latency | sub-ms | sub-ms | ms |
| Use for | live fan-out where history lives elsewhere | small/medium event logs, resume | high-volume logs, many consumers |

A common design uses both: Streams or Kafka as the durable log, and pub/sub (or direct sends) for the low-latency live path.

## Load balancing long-lived connections

- **L4 vs L7.** An L4 (TCP) balancer passes WebSockets through without understanding them. An L7 (HTTP) balancer must explicitly support `Upgrade`. Both work; L7 can route by path.
- **Connections don't rebalance.** Least-connections balancing helps at connect time, but once a socket is open it stays on its instance. After scaling out, new instances stay empty until clients reconnect. Some systems deliberately close a fraction of connections on busy nodes to rebalance.
- **Draining.** On shutdown: stop accepting upgrades, send close `1001` (optionally spread over a minute so clients don't all reconnect at once), then exit. Kubernetes' `terminationGracePeriodSeconds` must cover that window (module 35).
- **Idle timeouts.** Every hop (CDN, LB, ingress, nginx) has one. Your heartbeat interval must be shorter than the smallest.

nginx example for both WebSockets and SSE:

```nginx
location /ws {
  proxy_pass http://chat_backend;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 75s;      # longer than the heartbeat interval
}
location /rooms/ {
  proxy_pass http://chat_backend;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;         # SSE events must not be held back
  proxy_read_timeout 1h;
}
```

## Reconnect storms

When an instance dies, all its clients reconnect at once. When Redis blips, every instance may drop and resubscribe. Defenses:

- Clients: exponential backoff **with jitter**, and a cap.
- Servers: rate-limit upgrades (module 19), make the join path cheap (history from Redis, not a big SQL query), and shed load with `503` during the handshake when overloaded (module 29).
- Resume from the last id instead of reloading full state.

## Interview checklist

When you design a real-time feature, cover:

1. Transport choice and why (SSE vs WebSocket vs polling).
2. Connection auth and authorization per room.
3. Message ids, ordering scope (per room), dedupe.
4. Cross-instance fan-out and its cost.
5. History/resume and the delivery guarantee you actually offer.
6. Heartbeats, backpressure, connection limits.
7. Deploys and reconnect storms.
8. Presence, typing indicators: what's ephemeral vs stored.
