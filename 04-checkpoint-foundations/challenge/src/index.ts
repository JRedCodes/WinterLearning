import type http from "node:http";

/**
 * kv-lite's public contract. The tests import ONLY from this file, so keep
 * these exports and their shapes. Everything else (how many files, what they
 * are called, how they are split) is your design. See CHALLENGE.md.
 */

/** Source of "now", in milliseconds since the epoch. Tests inject a fake one. */
export interface Clock {
  now(): number;
}

export interface KvServerOptions {
  /** Path of the JSON snapshot file. Loaded on start, written on changes. */
  dataFile: string;
  /** Defaults to the system clock (Date.now). */
  clock?: Clock;
  /** How often expired keys are swept out of memory. Default 1000 ms. */
  sweepIntervalMs?: number;
  /** Writes are debounced: flush this long after the LAST change. Default 100 ms. */
  flushDebounceMs?: number;
  /** Largest accepted value in bytes. Default 1 MiB (1_048_576). */
  maxValueBytes?: number;
}

export interface KvStats {
  /** Live (unexpired) keys right now. */
  keys: number;
  /** GETs that found a live key. */
  hits: number;
  /** GETs for a missing or expired key. */
  misses: number;
  /** Successful PUTs. */
  sets: number;
  /** Successful DELETEs. */
  deletes: number;
  /** Keys removed because their TTL passed (lazily or by the sweeper). */
  expired: number;
  /** Snapshot writes completed. */
  flushes: number;
}

export interface KvServer {
  /** The underlying node:http server (not listening until listen() is called). */
  readonly server: http.Server;
  /** Starts listening; resolves with the actual port (pass 0 for a random free port). */
  listen(port?: number, host?: string): Promise<number>;
  /**
   * Graceful shutdown: stop the sweeper, stop accepting connections, wait for
   * the server to close, and flush any pending changes to disk before resolving.
   */
  close(): Promise<void>;
}

/**
 * Loads the snapshot (a missing file means "start empty"; a corrupt one must
 * make this promise reject), then builds the server. Does not listen.
 */
export async function createKvServer(options: KvServerOptions): Promise<KvServer> {
  throw new Error("Not implemented: createKvServer (see CHALLENGE.md)");
}
