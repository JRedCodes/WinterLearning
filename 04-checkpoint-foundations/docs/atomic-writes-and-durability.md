# Atomic writes and durability

"Did my data get saved?" has several possible answers, and engineers who build or operate datastores need to know which one a system gives. This page covers the levels, the mechanics behind them, and how real systems choose.

## The levels of "saved"

| Level | What happened | Survives process crash? | Survives power loss? |
|---|---|---|---|
| In memory | value is in your `Map` | ❌ | ❌ |
| Written | `write()` returned: bytes are in the OS page cache | ✅ (the OS still has them) | ❌ (maybe) |
| Synced | `fsync()` returned: the device says the bytes are on stable storage | ✅ | ✅ (if the hardware tells the truth) |
| Replicated | another machine has a copy (synced) | ✅ | ✅, even if this machine is gone |

kv-lite acknowledges at "in memory" and reaches "written" within the debounce window. That's a legitimate design (Redis's default AOF mode makes a similar choice), *as long as you say so*.

## Atomicity vs durability

They're different properties, and people mix them up:

- **Atomic**: a reader sees the old state or the new state, never a partial one. Write-temp-then-rename gives you this.
- **Durable**: once acknowledged, the change survives crashes. That needs fsync (and replication for machine loss).

You can have either without the other. kv-lite's snapshot is atomic but not durable for the last debounce window.

## Write-temp-then-rename, step by step

```ts
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function writeAtomic(file: string, contents: string) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(tmp, contents);
    // optional for durability: open tmp, fsync it, close
    await rename(tmp, file);
    // optional for durability: fsync the directory so the rename itself is persisted
  } catch (error) {
    await rm(tmp, { force: true }); // don't leave junk behind
    throw error;
  }
}
```

Why each detail:

- **Same directory**: `rename` is atomic only within one filesystem. Across filesystems you get `EXDEV`.
- **Unique temp name**: two processes (or two overlapping flushes, if you have that bug) must not write the same temp file.
- **Clean up on failure**: a full disk shouldn't leave a growing pile of `.tmp` files.
- **On Windows**, `rename` over an existing file can fail if another process has it open. Libraries like `write-file-atomic` retry. For this repo (Linux/macOS, CI on Linux) plain `rename` is fine.

## Adding fsync (if you want the stretch goal)

```ts
import { open } from "node:fs/promises";

const handle = await open(tmp, "w");
try {
  await handle.writeFile(contents);
  await handle.sync();          // fsync the file's data
} finally {
  await handle.close();
}
await rename(tmp, file);
const dir = await open(dirname(file), "r");
try { await dir.sync(); } finally { await dir.close(); }  // persist the directory entry (Linux)
```

Each fsync can take from tens of microseconds (NVMe with a write cache) to many milliseconds (network storage, spinning disks). That cost is why debouncing and batching exist.

## Snapshot vs append-only log

kv-lite rewrites the whole dataset every flush. That's O(size of data) per write, fine for small data and terrible for large data. The alternative is an **append-only log**:

| | Snapshot | Append-only log |
|---|---|---|
| Write cost | whole dataset | one record |
| Startup | read one file | replay the whole log |
| File size | size of data | grows forever until **compacted** |
| Corruption on crash | none with atomic rename | maybe a torn last record, detected with a checksum or length prefix and dropped |

Real systems combine them: append changes to a log for cheap durable writes, and periodically write a snapshot and truncate the log. Redis (RDB + AOF with rewrite), Postgres (WAL + checkpoints), Kafka (segments + compaction, [module 32](../../32-kafka-fundamentals/README.md)) and etcd (WAL + snapshots) all follow this pattern.

## How Redis chooses

| Setting | Behavior | Worst-case loss |
|---|---|---|
| RDB only | periodic snapshot (fork + temp file + rename) | everything since the last snapshot (minutes) |
| AOF `appendfsync always` | fsync after every write | ~nothing, much slower |
| AOF `appendfsync everysec` (default) | fsync once per second in the background | ~1 second |
| AOF `appendfsync no` | let the OS decide | ~30 seconds on Linux defaults |

Same dial as kv-lite's `flushDebounceMs`, just with more positions.

## Interview phrasing

> "Writes are acknowledged from memory and persisted with a debounced snapshot. The snapshot write is atomic (temp file + rename), so the file is never corrupt, but we can lose up to the debounce window plus OS buffering on a power failure. If we needed stronger durability I'd add an append-only log with fsync per batch, and replicate for machine loss."

That one paragraph demonstrates you understand atomicity, durability, the trade-off and the upgrade path.
