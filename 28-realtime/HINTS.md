# Hints · Real-time Systems

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: `parseClientMessage`

<details><summary>Hint 1</summary>

Two separate failure modes, two separate steps: `JSON.parse` (which throws, so wrap it) and schema validation (use `safeParse`, which doesn't throw).
</details>

<details><summary>Hint 2</summary>

`z.discriminatedUnion("type", [...])` with one `z.object` per message type. `RoomName` is already defined for you. For text: `z.string().trim().min(1).max(MAX_TEXT_LENGTH)`. zod objects strip unknown keys by default.
</details>

<details><summary>Hint 3</summary>

```ts
let json: unknown;
try { json = JSON.parse(raw); } catch { return { ok: false, code: "BAD_JSON", error: "..." }; }
const result = Schema.safeParse(json);
if (!result.success) return { ok: false, code: "INVALID_MESSAGE", error: result.error.issues.map(...).join("; ") };
return { ok: true, message: result.data };
```
</details>

## TODO 2: `RoomHub`

<details><summary>Hint 1</summary>

`Map<string, Set<Subscriber>>`. The unsubscribe function is a closure over `room` and `subscriber`.
</details>

<details><summary>Hint 2</summary>

In unsubscribe: delete from the set, and if the set is now empty, delete the map entry. Deleting twice from a `Set` is harmless, so idempotency is nearly free.
</details>

<details><summary>Hint 3</summary>

In `dispatch`, iterate over a copy (`[...set]`) so subscribers can unsubscribe mid-loop, and wrap each `deliver` call in its own `try/catch` that calls `onError`.
</details>

## TODO 3: `safeSend`

<details><summary>Hint 1</summary>

Three outcomes, checked in order: not open, would overflow, fine.
</details>

<details><summary>Hint 2</summary>

`Buffer.byteLength(data)` gives the UTF-8 size. `data.length` counts UTF-16 code units, which is wrong for "é" and emoji.
</details>

## TODO 4: `RedisHistoryRepository`

<details><summary>Hint 1</summary>

Use a counter key per room for ids (`INCR`) and a list per room for messages (`RPUSH` + `LTRIM` to keep the newest N). `LRANGE key 0 -1` returns the list oldest first.
</details>

<details><summary>Hint 2</summary>

The atomicity test fires 40 appends at once. If you `INCR` in one round trip and `RPUSH` in another, two clients can interleave and push id 8 before id 7. Put INCR + RPUSH + LTRIM in one Lua script with `redis.eval(script, numKeys, ...keys, ...args)`.
</details>

<details><summary>Hint 3</summary>

The script needs the id inside the stored JSON. Either use `cjson` in Lua, or pass the draft JSON as an argument and splice the id in as a string:

```lua
local id = redis.call('INCR', KEYS[1])
local json = '{"id":' .. id .. ',' .. string.sub(ARGV[1], 2)   -- ARGV[1] starts with "{"
redis.call('RPUSH', KEYS[2], json)
redis.call('LTRIM', KEYS[2], -tonumber(ARGV[2]), -1)
return json
```
`since()` can filter `recent()` by id: the list holds at most 50 items.
</details>

## TODO 5: `RedisMessageBus`

<details><summary>Hint 1</summary>

`subscriber.on("message", (channel, payload) => ...)` plus `await subscriber.subscribe(channel)`. Publishing uses the *other* connection.
</details>

<details><summary>Hint 2</summary>

Store the listener as an arrow-function property (`private readonly onMessage = (channel, payload) => {...}`) so `close()` can pass the same reference to `subscriber.off("message", this.onMessage)`.
</details>

<details><summary>Hint 3</summary>

In the listener: ignore other channels; `try { JSON.parse }` and check `kind` is `"message"` or `"presence"` and `room` is a string; on failure call `onError` and return; otherwise call every handler. In `close()`: clear handlers, `off(...)`, `await unsubscribe(channel)`.
</details>

## TODO 6: `subscribeWithBackfill`

<details><summary>Hint 1</summary>

Keep a `buffering` flag and a `buffer` array. The subscriber you register pushes into the buffer while buffering, and delivers directly afterwards.
</details>

<details><summary>Hint 2</summary>

Track `lastId`, the highest message id delivered so far. After the backfill, set it to the max backfill id. Any message event with `id <= lastId` is dropped; otherwise update `lastId` and deliver. Presence events have no id: always deliver.
</details>

<details><summary>Hint 3</summary>

Order: `const off = hub.subscribe(...)` → `try { backfill = await loadBackfill() } catch (e) { off(); throw e }` → `onBackfill(backfill)` → `buffering = false` → flush `buffer.splice(0)` through the same dedupe function → `return off`.
</details>

## TODO 7: `ChatConnection`

<details><summary>Hint 1</summary>

State per connection: `rooms: Map<string, () => void>` (room → unsubscribe) and `queue: Promise<void>`. `receive` chains onto the queue; `handle` parses and then `switch`es on `message.type`.
</details>

<details><summary>Hint 2</summary>

`join`: if already in the room, send `joined` with fresh history and return. Otherwise `await subscribeWithBackfill({ hub, room, loadBackfill: () => chat.history(room), onBackfill: (history) => send joined, onEvent: (e) => send(toServerMessage(e)) })`, store the unsubscribe, then `chat.announce(room, user, "join")`. The socket can close while you're awaiting; check a `closed` flag afterwards and unsubscribe if so.
</details>

<details><summary>Hint 3</summary>

```ts
receive(raw) {
  this.queue = this.queue.then(() => this.handle(raw)).catch((err) => {
    this.onError(err);
    this.send({ type: "error", code: "INTERNAL", message: "Something went wrong" });
  });
  return this.queue;
}
```
`close()`: set `closed`, copy and clear `rooms`, call every unsubscribe, then announce `"leave"` for each room (catch errors: Redis may be gone during shutdown).
</details>

## TODO 8: `attachChatServer`

<details><summary>Hint 1</summary>

The `ws` README has a "client authentication" example with `noServer: true` and a "detect broken connections" example. Those two are most of this TODO.
</details>

<details><summary>Hint 2</summary>

`new URL(req.url ?? "/", "http://localhost")` gives you `pathname` and `searchParams.get("token")`. Use the provided `rejectUpgrade` for 401/404. Track liveness in a `WeakMap<WebSocket, boolean>` (or a property) and reset it on `"pong"`.
</details>

<details><summary>Hint 3</summary>

```ts
const timer = setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) { ws.terminate(); continue; }
    alive.set(ws, false);
    ws.ping();
  }
}, deps.heartbeatMs);
timer.unref();
```
`terminate()` fires `"close"`, which calls `connection.close()`, which announces the leave. You get the presence test for free.
</details>

## TODO 9: SSE route

<details><summary>Hint 1</summary>

Validate the room first (a thrown `HttpError` still becomes a JSON 400 because no headers are sent yet). Then `res.status(200).set({...})`, `res.flushHeaders()`, `res.write("retry: 2000\n\n")`.
</details>

<details><summary>Hint 2</summary>

Write one `writeEvent(res, event)` helper that formats both kinds, and use it for the backfill (wrap each message as a `{ kind: "message", ... }` event) and for live events. Remember the blank line at the end of each event.
</details>

<details><summary>Hint 3</summary>

Register `req.on("close", ...)` **before** awaiting `subscribeWithBackfill`, and keep a `closed` flag: if the client disconnected while the backfill loaded, call the returned unsubscribe immediately instead of storing it. Clear the keep-alive interval in the same close handler.
</details>
