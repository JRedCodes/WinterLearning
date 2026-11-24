import type { Redis } from "ioredis";
import type pg from "pg";
import type { Config } from "./config.js";
import type { Clock } from "./lib/clock.js";
import type { DomainEvent, EventPublisher } from "./messaging/eventPublisher.js";
import type { EmailSender } from "./notifications/emailSender.js";

/**
 * The composition contract. The acceptance tests (and server.ts / worker.ts) build
 * the system ONLY through `buildContainer(deps)` + `createApp(container)`, so you
 * are free to structure everything behind it however you like. (docs/architecture.md
 * shows the layout the reference solution uses.)
 */

/** Infrastructure handed in from outside. The container does not own (or close) these. */
export interface ContainerDeps {
  config: Config;
  pool: pg.Pool;
  /** A connected ioredis client for normal commands (NOT for SUBSCRIBE). */
  redis: Redis;
  clock: Clock;
  publisher: EventPublisher;
  emailSender: EmailSender;
}

export interface OutboxRelayRunResult {
  /** Events handed to the publisher and marked as published in this run. */
  published: number;
  /** Events the publisher rejected in this run (they stay pending for the next run). */
  failed: number;
}

export interface NotificationWorker {
  /** Stops taking new jobs and waits for the current one to finish. */
  close(): Promise<void>;
}

export interface Container {
  // TODO(M1+): add the services/stores your createApp() needs, e.g.
  //   authService, eventService, holdService, bookingService, sessions, cache, ...

  /** M4: moves pending outbox rows to the publisher. One batch per call. */
  outboxRelay: { runOnce(): Promise<OutboxRelayRunResult> };

  /** M5: releases holds whose expiry (by the injected clock) has passed. Returns how many seats were released. */
  holdSweeper: { runOnce(): Promise<number> };

  /** M4: the notifications consumer. */
  notifications: {
    /** Called for every event read from the stream. Must be idempotent per event id. */
    handle(event: DomainEvent): Promise<void>;
    /** Starts processing queued notification jobs (BullMQ worker). */
    startWorker(): NotificationWorker;
  };

  /** Closes what the container itself opened (queues, subscriber connections). Not the pool/redis it was given. */
  close(): Promise<void>;
}

export function buildContainer(deps: ContainerDeps): Container {
  void deps;
  throw new Error("Not implemented: buildContainer (start with M1 in CHALLENGE.md)");
}
