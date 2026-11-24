import express, { type ErrorRequestHandler } from "express";
import { fileURLToPath } from "node:url";
import { HttpError } from "./lib/httpError.js";
import type { RoomHub } from "./realtime/roomHub.js";
import { roomsRouter } from "./routes/rooms.js";
import type { ChatService } from "./services/chatService.js";

export interface AppDeps {
  chat: ChatService;
  hub: RoomHub;
  sseKeepAliveMs: number;
}

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

/**
 * The HTTP side of the chat. WebSockets are attached to the same http.Server
 * in instance.ts; Express never sees upgrade requests.
 */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/rooms", roomsRouter({ chat: deps.chat, hub: deps.hub, keepAliveMs: deps.sseKeepAliveMs }));
  // A tiny demo client for poking at the server in a browser (npm run dev, open /).
  app.use(express.static(publicDir));

  app.use((req, _res, next) => {
    next(new HttpError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`));
  });
  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    // Mid-stream (e.g. an SSE response): too late for a status code.
    res.end();
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
