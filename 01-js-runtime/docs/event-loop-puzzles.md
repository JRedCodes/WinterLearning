# Event loop puzzles

Predict the output of each snippet **before** opening the answer. Then run it to check: save it as `puzzle.cjs` and run `node puzzle.cjs`. The `.cjs` extension matters: it makes the file CommonJS, and puzzle 5 shows why ES modules can behave differently.

The tools you need (from the lesson):

1. Synchronous code runs to completion first.
2. After each macrotask: drain **all** `process.nextTick` callbacks, then **all** promise microtasks (including any they add).
3. Then the loop moves through its phases: timers → poll (I/O) → check (`setImmediate`) → …

---

## Puzzle 1: the classic

```js
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C")).then(() => console.log("D"));
process.nextTick(() => console.log("E"));
queueMicrotask(() => console.log("F"));
console.log("G");
```

<details><summary>Answer</summary>

`A G E C F D B`

- `A`, `G`: synchronous.
- `E`: the nextTick queue is drained before promise microtasks.
- `C`, `F`: both were queued as microtasks during the synchronous run, in that order.
- `D`: queued only when `C`'s callback finished, so it goes to the back of the microtask queue, behind `F`.
- `B`: a timer is a macrotask; it runs after all microtasks.
</details>

## Puzzle 2: inside an I/O callback

```js
const fs = require("node:fs");
fs.readFile(__filename, () => {
  setTimeout(() => console.log("timeout"), 0);
  setImmediate(() => console.log("immediate"));
  process.nextTick(() => console.log("nextTick"));
});
```

<details><summary>Answer</summary>

`nextTick immediate timeout`, every time.

The callback runs in the **poll** phase. nextTick runs as soon as the callback returns. The next phase after poll is **check**, so `setImmediate` runs before the loop wraps around to **timers**. From the main module (outside any I/O callback) the timeout/immediate order is *not* deterministic. Try it.
</details>

## Puzzle 3: where does `await` pause?

```js
async function a() { console.log("a1"); await b(); console.log("a2"); }
async function b() { console.log("b1"); }
console.log("start");
a();
Promise.resolve().then(() => console.log("then"));
console.log("end");
```

<details><summary>Answer</summary>

`start a1 b1 end a2 then`

An `async` function runs **synchronously** until its first `await`. So `a1` and `b1` print immediately (`b` has no await at all). The rest of `a` (`a2`) becomes a microtask queued when `b()`'s promise resolves, which happens before the `.then` line runs, so `a2` comes before `then`. The lesson: code before the first `await` is not deferred. This is exactly why an `async run()` called from a constructor emits its first event synchronously.
</details>

## Puzzle 4: microtasks that queue more work

```js
Promise.resolve().then(() => {
  console.log("p1");
  process.nextTick(() => console.log("tick inside promise"));
  Promise.resolve().then(() => console.log("p2"));
});
setImmediate(() => console.log("immediate"));
```

<details><summary>Answer</summary>

`p1 p2 tick inside promise immediate`

While Node is draining the promise microtask queue, new promise jobs join the same drain, so `p2` runs right after `p1`. The nextTick queued from inside a promise callback runs once the promise queue is empty, and only then does the loop move on to `setImmediate`. An endless chain of microtasks would never let `immediate` run: that's starvation.
</details>

## Puzzle 5: the same code as an ES module

Save this as `puzzle.mjs` (or in a project with `"type": "module"`):

```js
process.nextTick(() => console.log("nextTick"));
Promise.resolve().then(() => console.log("promise"));
```

<details><summary>Answer</summary>

`promise nextTick` (in CommonJS it would be `nextTick promise`).

ES modules are evaluated asynchronously: the module body itself runs inside a promise job. The promise microtask queue is still draining when the module finishes, so the `.then` callback runs before Node gets back to the nextTick queue. Don't memorize this; just never depend on nextTick-vs-promise ordering.
</details>

## Puzzle 6: emit is synchronous

```js
const { EventEmitter } = require("node:events");
const e = new EventEmitter();
e.on("x", () => console.log("listener 1"));
e.on("x", () => {
  Promise.resolve().then(() => console.log("microtask from listener"));
  console.log("listener 2");
});
console.log("before emit");
e.emit("x");
console.log("after emit");
```

<details><summary>Answer</summary>

`before emit  listener 1  listener 2  after emit  microtask from listener`

`emit` calls every listener right away, in registration order, before returning. Nothing about events is asynchronous unless a listener makes it so. That's why an event emitted before `.on()` is called is lost, and why Node core defers "ready"-style events with `process.nextTick`.
</details>

## Puzzle 7: the starving timer

```js
const start = Date.now();
setTimeout(() => console.log(`timer fired after ${Date.now() - start}ms`), 10);

async function crunch() {
  for (let chunk = 0; chunk < 200; chunk++) {
    const until = Date.now() + 5;
    while (Date.now() < until) {} // 5ms of "CPU work"
    await Promise.resolve();      // "yield"
  }
  console.log(`crunch done after ${Date.now() - start}ms`);
}
crunch();
```

<details><summary>Answer</summary>

`crunch done after ~1000ms` then `timer fired after ~1000ms`.

The 10ms timer can't fire until the whole crunch finishes, because `await Promise.resolve()` only yields to microtasks. Replace it with `await new Promise((r) => setImmediate(r))` and the timer fires after roughly 10–15ms, in the middle of the crunch. That's the difference between a server that stalls and one that stays responsive.
</details>

---

## Make your own

Good puzzles mix: a timer, an immediate, a nextTick, a resolved promise with a chained `.then`, an `async` function with code before and after an `await`, and an I/O callback. Write the prediction down first. If you got it wrong, find the rule you misapplied: that's the actual learning.
