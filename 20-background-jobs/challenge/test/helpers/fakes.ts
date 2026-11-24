import type { EmailMessage, EmailSender, Thumbnailer } from "../../src/domain/ports.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Records sends. Fails the first `failures` calls (use Infinity for "always"). */
export class FakeEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  attempts = 0;
  constructor(
    public failures = 0,
    public delayMs = 0,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    this.attempts++;
    if (this.delayMs) await sleep(this.delayMs);
    if (this.failures > 0) {
      this.failures--;
      throw new Error("email provider returned 503");
    }
    this.sent.push(message);
  }
}

export class FakeThumbnailer implements Thumbnailer {
  started = 0;
  finished = 0;
  constructor(
    public failures = 0,
    public delayMs = 0,
  ) {}

  async createThumbnail(imageUrl: string): Promise<string> {
    this.started++;
    if (this.delayMs) await sleep(this.delayMs);
    if (this.failures > 0) {
      this.failures--;
      throw new Error("image service timed out");
    }
    this.finished++;
    return `https://cdn.test/thumb?src=${encodeURIComponent(imageUrl)}`;
  }
}

/** Polls `check` until it returns true, or fails with `message` after `timeoutMs`. */
export async function waitFor(check: () => boolean | Promise<boolean>, message: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(20);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${message}`);
}
