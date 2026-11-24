import type { BusMessage, ConsumedEvent, EventBus } from "./eventBus.js";

/**
 * A fake broker for tests: records what was published and can be told to fail.
 *   bus.failNext(3)                         → the next 3 publish() calls reject
 *   bus.failOn((topic, m) => m.key === id)  → publish() rejects for matching messages (once by default)
 *   bus.delayMs = 200                       → every publish() takes 200ms (for concurrency tests)
 *   bus.heal()                              → clear all injected failures
 */
export class InMemoryEventBus implements EventBus {
  readonly published: { topic: string; message: BusMessage }[] = [];
  publishCalls = 0;
  delayMs = 0;
  /** Highest number of publish() calls that were in progress at the same time. */
  maxInFlight = 0;
  private inFlight = 0;

  private failures = 0;
  private predicates: { match: (topic: string, message: BusMessage) => boolean; remaining: number }[] = [];

  failNext(n = 1): void {
    this.failures += n;
  }

  failOn(match: (topic: string, message: BusMessage) => boolean, times = 1): void {
    this.predicates.push({ match, remaining: times });
  }

  heal(): void {
    this.failures = 0;
    this.predicates = [];
  }

  async publish(topic: string, messages: BusMessage[]): Promise<void> {
    this.publishCalls++;
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await this.doPublish(topic, messages);
    } finally {
      this.inFlight--;
    }
  }

  private async doPublish(topic: string, messages: BusMessage[]): Promise<void> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failures > 0) {
      this.failures--;
      throw new Error("simulated broker unavailable");
    }
    for (const m of messages) {
      const p = this.predicates.find((x) => x.remaining > 0 && x.match(topic, m));
      if (p) {
        p.remaining--;
        throw new Error(`simulated publish failure for key ${m.key}`);
      }
    }
    for (const message of messages) this.published.push({ topic, message: structuredClone(message) });
  }

  /** Messages published to one topic, in order. */
  messages(topic: string): BusMessage[] {
    return this.published.filter((p) => p.topic === topic).map((p) => p.message);
  }

  /** Turns a published message into what a consumer would receive (offset = position in the topic). */
  asConsumed(topic: string, index: number): ConsumedEvent {
    const m = this.messages(topic)[index];
    if (!m) throw new Error(`no message #${index} on ${topic}`);
    return { topic, partition: 0, offset: String(index), key: m.key, value: m.value, headers: { ...m.headers } };
  }
}
