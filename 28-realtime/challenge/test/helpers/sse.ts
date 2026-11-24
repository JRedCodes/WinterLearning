export interface SseEvent {
  id?: string;
  event?: string;
  data?: string;
  /** Lines starting with ":" (keep-alives). */
  comments: string[];
  retry?: string;
}

/**
 * A minimal SSE client on top of fetch, so tests can see the raw frames
 * (EventSource hides comments and the retry field).
 */
export class SseStream {
  readonly events: SseEvent[] = [];
  status = 0;
  headers = new Headers();
  private readonly controller = new AbortController();
  private buffer = "";
  private consumed = 0;
  private waiters: Array<() => void> = [];
  private ended = false;

  static async open(url: string, headers: Record<string, string> = {}): Promise<SseStream> {
    const stream = new SseStream();
    const res = await fetch(url, { headers: { accept: "text/event-stream", ...headers }, signal: stream.controller.signal });
    stream.status = res.status;
    stream.headers = res.headers;
    if (res.body) void stream.pump(res.body);
    return stream;
  }

  private async pump(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of body) {
        this.buffer += decoder.decode(chunk, { stream: true });
        let idx: number;
        while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
          const block = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          this.events.push(parseBlock(block));
          for (const wake of this.waiters) wake();
        }
      }
    } catch {
      // aborted
    } finally {
      this.ended = true;
      for (const wake of this.waiters) wake();
    }
  }

  /** Message events (event: message) parsed as JSON, in arrival order. */
  messages(): Array<{ id: number; user: string; text: string; room: string }> {
    return this.events.filter((e) => e.event === "message").map((e) => JSON.parse(e.data ?? "null"));
  }

  /** Waits for the next unconsumed event matching the predicate. */
  async next(predicate: (e: SseEvent) => boolean, label: string, timeoutMs = 2_000): Promise<SseEvent> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (let i = this.consumed; i < this.events.length; i++) {
        const e = this.events[i]!;
        if (predicate(e)) {
          this.consumed = i + 1;
          return e;
        }
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0 || this.ended) {
        throw new Error(`Timed out waiting for SSE ${label}. Events so far: ${JSON.stringify(this.events, null, 1)}`);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, Math.min(remaining, 50));
        function done() {
          clearTimeout(timer);
          resolve();
        }
        this.waiters.push(done);
      });
      this.waiters = [];
    }
  }

  close(): void {
    this.controller.abort();
  }
}

function parseBlock(block: string): SseEvent {
  const event: SseEvent = { comments: [] };
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      event.comments.push(line.slice(1).trim());
      continue;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "id") event.id = value;
    else if (field === "event") event.event = value;
    else if (field === "data") event.data = event.data === undefined ? value : `${event.data}\n${value}`;
    else if (field === "retry") event.retry = value;
  }
  return event;
}
