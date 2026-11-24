import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { verifyToken } from "./auth/tokens.js";
import { RedisMessageBus } from "./bus/redisMessageBus.js";
import { connectRedis } from "./lib/redis.js";
import { attachChatServer, type ChatServer } from "./realtime/chatServer.js";
import { RoomHub } from "./realtime/roomHub.js";
import { RedisHistoryRepository } from "./repositories/redisHistoryRepository.js";
import { ChatService } from "./services/chatService.js";

export interface InstanceOptions {
  /** 0 = pick a free port (tests). */
  port: number;
  redisUrl: string;
  keyPrefix: string;
  tokenSecret: string;
  heartbeatMs: number;
  sseKeepAliveMs: number;
  maxBufferedBytes: number;
  historySize: number;
  onError?: (err: unknown) => void;
}

export interface Instance {
  port: number;
  /** e.g. "http://127.0.0.1:54321" */
  httpUrl: string;
  /** e.g. "ws://127.0.0.1:54321/ws" */
  wsUrl: string;
  hub: RoomHub;
  chat: ChatService;
  chatServer: ChatServer;
  server: Server;
  close(): Promise<void>;
}

/**
 * Wires one chat server instance. server.ts calls this once; the tests call it
 * twice to get two instances that only share Redis, just like two pods behind
 * a load balancer.
 */
export async function startInstance(options: InstanceOptions): Promise<Instance> {
  const onError = options.onError ?? ((err: unknown) => console.error(err));
  const redis = await connectRedis(options.redisUrl);
  const subscriber = await connectRedis(options.redisUrl);

  const hub = new RoomHub({ onError });
  const bus = new RedisMessageBus({
    publisher: redis,
    subscriber,
    channel: `${options.keyPrefix}events`,
    onError,
  });
  const history = new RedisHistoryRepository({ redis, prefix: options.keyPrefix, maxMessages: options.historySize });
  const chat = new ChatService({ history, bus });

  // Everything that arrives on the bus is fanned out locally.
  await bus.subscribe((event) => hub.dispatch(event));

  const app = createApp({ chat, hub, sseKeepAliveMs: options.sseKeepAliveMs });
  const server = createServer(app);
  const chatServer = attachChatServer(server, {
    chat,
    hub,
    verifyToken: (token) => verifyToken(token, options.tokenSecret),
    heartbeatMs: options.heartbeatMs,
    maxBufferedBytes: options.maxBufferedBytes,
    onError,
  });

  await new Promise<void>((resolve) => server.listen(options.port, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    port,
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    hub,
    chat,
    chatServer,
    server,
    async close() {
      await chatServer.close();
      // SSE responses never end on their own, so server.close() would wait forever.
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await bus.close();
      await Promise.all([redis.quit(), subscriber.quit()]);
    },
  };
}
