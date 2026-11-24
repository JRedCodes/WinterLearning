import type { AddressInfo } from "node:net";
import type { App } from "./context.js";

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

/** Real HTTP server on a random port (SSE needs a real socket; supertest buffers bodies). */
export async function startServer(app: App): Promise<RunningServer> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface SseMessage {
  event: string;
  data: unknown;
}

/** A tiny Server-Sent Events client: enough to read named events with JSON data. */
export class SseStream {
  private buffer = "";
  private queue: SseMessage[] = [];
  private waiters: (() => void)[] = [];
  private ended = false;

  private constructor(
    readonly status: number,
    readonly contentType: string,
    private readonly controller: AbortController,
    body: ReadableStream<Uint8Array> | null,
  ) {
    if (body) void this.pump(body);
    else this.ended = true;
  }

  static async open(url: string): Promise<SseStream> {
    const controller = new AbortController();
    const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: controller.signal });
    return new SseStream(res.status, res.headers.get("content-type") ?? "", controller, res.body);
  }

  private async pump(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let idx: number;
        while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
          const block = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          this.parseBlock(block);
        }
      }
    } catch {
      // aborted
    } finally {
      this.ended = true;
      this.wake();
    }
  }

  private parseBlock(block: string) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":") || line === "") continue; // comment / heartbeat
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length === 0) return;
    const raw = data.join("\n");
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // leave as string
    }
    this.queue.push({ event, data: parsed });
    this.wake();
  }

  private wake() {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  /** Resolves with the next message named `event` (skipping others), or rejects after the timeout. */
  async next(event: string, timeoutMs = 3_000): Promise<SseMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.queue.findIndex((m) => m.event === event);
      if (i !== -1) return this.queue.splice(i, 1)[0]!;
      if (this.ended) throw new Error(`SSE stream ended before an "${event}" event arrived`);
      const left = deadline - Date.now();
      if (left <= 0) {
        const seen = this.queue.map((m) => m.event).join(", ") || "nothing";
        throw new Error(`No "${event}" SSE event within ${timeoutMs}ms (queued: ${seen})`);
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.controller.abort();
  }
}
