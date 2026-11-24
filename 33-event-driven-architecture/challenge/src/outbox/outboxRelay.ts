import type pg from "pg";
import type { EventBus } from "../events/eventBus.js";
import { silentLogger, type Logger } from "../lib/logger.js";

export interface OutboxRelayDeps {
  pool: pg.Pool;
  bus: EventBus;
  /** Max rows published per runOnce(). */
  batchSize?: number;
  logger?: Logger;
}

/**
 * Drains the transactional outbox into the event bus ("polling publisher").
 *
 * Started during the incident follow-up, never finished: see CHALLENGE.md for
 * what runOnce() has to guarantee.
 */
export class OutboxRelay {
  private readonly pool: pg.Pool;
  private readonly bus: EventBus;
  private readonly batchSize: number;
  private readonly logger: Logger;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> | undefined;

  constructor(deps: OutboxRelayDeps) {
    this.pool = deps.pool;
    this.bus = deps.bus;
    this.batchSize = deps.batchSize ?? 100;
    this.logger = deps.logger ?? silentLogger;
  }

  /** Publishes up to batchSize pending outbox rows. Returns how many were published. */
  async runOnce(): Promise<number> {
    throw new Error("OutboxRelay.runOnce() is not implemented yet");
  }

  /** Polls every intervalMs until stop(). One run at a time. */
  start(intervalMs: number): void {
    const tick = async () => {
      try {
        this.running = this.runOnce();
        const n = await this.running;
        // A full batch probably means more is waiting: go again right away.
        this.timer = setTimeout(tick, n === this.batchSize ? 0 : intervalMs);
      } catch (err) {
        this.logger.error("outbox relay run failed", { error: (err as Error).message });
        this.timer = setTimeout(tick, intervalMs);
      }
    };
    this.timer = setTimeout(tick, 0);
  }

  async stop(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    await this.running?.catch(() => {});
  }
}
