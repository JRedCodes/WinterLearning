import type { Clock } from "../../src/lib/clock.js";
import type { DomainEvent, EventPublisher } from "../../src/messaging/eventPublisher.js";
import type { Email, EmailSender } from "../../src/notifications/emailSender.js";

/** A clock that only moves when the test says so. */
export class FakeClock implements Clock {
  private ms: number;
  constructor(start: Date) {
    this.ms = start.getTime();
  }
  now(): Date {
    return new Date(this.ms);
  }
  set(date: Date): void {
    this.ms = date.getTime();
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

/** Stands in for Kafka. Records what was published; can simulate a broker outage and slowness. */
export class InMemoryEventPublisher implements EventPublisher {
  published: DomainEvent[] = [];
  /** Every publish() rejects while true. */
  failAlways = false;
  /** Artificial latency per publish() call, to make concurrent relays overlap. */
  delayMs = 0;
  calls = 0;

  async publish(events: readonly DomainEvent[]): Promise<void> {
    this.calls++;
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failAlways) throw new Error("broker unavailable (fake)");
    // Copy, so later mutation by the caller can't change what we "sent".
    this.published.push(...events.map((e) => structuredClone(e)));
  }

  reset(): void {
    this.published = [];
    this.failAlways = false;
    this.delayMs = 0;
    this.calls = 0;
  }
}

/** Records emails; can fail the next N sends. */
export class FakeEmailSender implements EmailSender {
  sent: Email[] = [];
  attempts = 0;
  private failuresLeft = 0;

  failNext(n: number): void {
    this.failuresLeft = n;
  }

  async send(email: Email): Promise<void> {
    this.attempts++;
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new Error("smtp timeout (fake)");
    }
    this.sent.push(email);
  }

  reset(): void {
    this.sent = [];
    this.attempts = 0;
    this.failuresLeft = 0;
  }
}

/** Polls `check` until it returns true or the timeout passes. */
export async function waitFor(check: () => boolean, what: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
