import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData } from "ws";
import type { ChatService } from "../services/chatService.js";
import type { RoomHub } from "./roomHub.js";

export interface ChatServerDeps {
  chat: ChatService;
  hub: RoomHub;
  /** Returns the username for a valid token, or null. */
  verifyToken: (token: string) => string | null;
  heartbeatMs: number;
  maxBufferedBytes: number;
  /** URL path that accepts WebSocket upgrades. Default "/ws". */
  path?: string;
  onError?: (err: unknown) => void;
}

export interface ChatServer {
  /** Number of open WebSocket connections on this instance. */
  connectionCount(): number;
  /** Stops the heartbeat, closes every socket (1001 Going Away) and stops accepting upgrades. */
  close(): Promise<void>;
}

/** Largest frame we accept from a client. ws closes the socket with 1009 if exceeded. */
export const MAX_PAYLOAD_BYTES = 16 * 1024;

/**
 * Attaches the chat WebSocket endpoint to an existing HTTP server, so REST,
 * SSE and WebSockets share one port.
 *
 * TODO(8): implement it.
 *
 * 1. Create a WebSocketServer with { noServer: true, maxPayload: MAX_PAYLOAD_BYTES }
 *    and handle the http server's "upgrade" event yourself:
 *      - path other than deps.path ("/ws")      → rejectUpgrade(socket, 404, "Not Found")
 *      - ?token= missing or verifyToken → null  → rejectUpgrade(socket, 401, "Unauthorized")
 *      - otherwise wss.handleUpgrade(...) and set the connection up
 * 2. Per connection: a ChatConnection (TODO 7). Wire ws "message" (text
 *    frames → connection.receive(rawToString(data)); answer binary frames
 *    with an INVALID_MESSAGE error), "close" → connection.close(),
 *    "error" → onError. Then connection.start().
 * 3. Heartbeat: every heartbeatMs, terminate() any socket that hasn't sent a
 *    pong since the previous tick; mark the rest "not alive" and ping() them.
 *    A "pong" marks a socket alive again. unref() the interval.
 * 4. close(): stop the heartbeat, remove your "upgrade" listener, close every
 *    client with 1001, and resolve when wss.close() calls back. A dead peer
 *    never completes the close handshake, so terminate stragglers after ~1s.
 */
export function attachChatServer(server: Server, deps: ChatServerDeps): ChatServer {
  throw new Error("Not implemented");
}

export function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

// Keeps the import used in the starter; you'll need WebSocketServer for TODO 8.
void WebSocketServer;
