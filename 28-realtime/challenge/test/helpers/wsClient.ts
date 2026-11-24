import WebSocket, { type ClientOptions } from "ws";
import type { ServerMessage } from "../../src/domain/chat.js";
import { tokenFor } from "./instances.js";

/**
 * A WebSocket test client that records every server message, so tests can
 * wait for "the next message matching X" without caring about interleaving.
 */
export class TestClient {
  readonly received: ServerMessage[] = [];
  private readonly consumed = new Set<number>();
  private waiters: Array<() => void> = [];
  closeCode: number | undefined;
  readonly closed: Promise<number>;

  private constructor(readonly ws: WebSocket) {
    ws.on("message", (data) => {
      this.received.push(JSON.parse(String(data)) as ServerMessage);
      for (const wake of this.waiters) wake();
    });
    this.closed = new Promise((resolve) => {
      ws.on("close", (code) => {
        this.closeCode = code;
        resolve(code);
      });
    });
  }

  /** Connects as `user` (signed token) and waits for the socket to open. */
  static connect(wsUrl: string, user: string, options: ClientOptions = {}): Promise<TestClient> {
    return TestClient.connectRaw(`${wsUrl}?token=${encodeURIComponent(tokenFor(user))}`, options);
  }

  static connectRaw(url: string, options: ClientOptions = {}): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, options);
      const client = new TestClient(ws);
      ws.once("open", () => resolve(client));
      ws.once("unexpected-response", (_req, res) => reject(new Error(`upgrade rejected with HTTP ${res.statusCode}`)));
      ws.once("error", reject);
    });
  }

  /** Resolves with the HTTP status the server answered the upgrade with. */
  static rejectionStatus(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.once("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
        ws.terminate();
      });
      ws.once("open", () => {
        ws.close();
        reject(new Error("expected the upgrade to be rejected, but the socket opened"));
      });
      ws.once("error", () => {});
    });
  }

  send(message: unknown): void {
    this.ws.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  /** Waits for the first not-yet-consumed message matching `predicate`. */
  async next<T extends ServerMessage = ServerMessage>(
    predicate: (m: ServerMessage) => boolean,
    label: string,
    timeoutMs = 2_000,
  ): Promise<T> {
    const find = () => {
      const index = this.received.findIndex((m, i) => !this.consumed.has(i) && predicate(m));
      if (index === -1) return undefined;
      this.consumed.add(index);
      return this.received[index] as T;
    };
    const found = find();
    if (found) return found;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.\nReceived so far: ${JSON.stringify(this.received, null, 1)}`));
      }, timeoutMs);
      const wake = () => {
        const match = find();
        if (!match) return;
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== wake);
        resolve(match);
      };
      this.waiters.push(wake);
    });
  }

  nextOfType<K extends ServerMessage["type"]>(type: K, extra: (m: Extract<ServerMessage, { type: K }>) => boolean = () => true, timeoutMs?: number) {
    return this.next<Extract<ServerMessage, { type: K }>>(
      (m) => m.type === type && extra(m as Extract<ServerMessage, { type: K }>),
      `a "${type}" message`,
      timeoutMs,
    );
  }

  /** Fails if a matching message arrives within `ms`. */
  async expectNone(predicate: (m: ServerMessage) => boolean, label: string, ms = 300): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    const bad = this.received.find((m, i) => !this.consumed.has(i) && predicate(m));
    if (bad) throw new Error(`Expected no ${label}, but got: ${JSON.stringify(bad)}`);
  }

  close(): Promise<number> {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close();
    return this.closed;
  }
}
