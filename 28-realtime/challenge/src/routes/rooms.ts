import { Router, type Request } from "express";
import { RoomName } from "../realtime/protocol.js";
import type { RoomHub } from "../realtime/roomHub.js";
import type { ChatService } from "../services/chatService.js";
import { HttpError } from "../lib/httpError.js";

export interface RoomsRouterDeps {
  chat: ChatService;
  hub: RoomHub;
  /** Interval for ": keep-alive" comments on SSE streams. */
  keepAliveMs: number;
}

/**
 * Read-only HTTP access to rooms:
 *   GET /rooms/:room/history  JSON snapshot of recent messages
 *   GET /rooms/:room/events   Server-Sent Events live feed (with resume)
 */
export function roomsRouter(deps: RoomsRouterDeps): Router {
  const router = Router();

  router.get("/:room/history", async (req, res) => {
    const room = parseRoom(req.params.room);
    res.json({ data: await deps.chat.history(room) });
  });

  /**
   * TODO(9): the SSE feed.
   *
   * 1. Validate the room with parseRoom (invalid → 400 via the error handler,
   *    BEFORE any SSE header is written).
   * 2. Respond 200 with headers:
   *      Content-Type: text/event-stream; charset=utf-8
   *      Cache-Control: no-cache, no-transform
   *      Connection: keep-alive
   *      X-Accel-Buffering: no
   *    flush them right away, and write "retry: 2000\n\n".
   * 3. Backfill + live with subscribeWithBackfill (TODO 6). The backfill is
   *    chat.historySince(room, lastEventId) when parseLastEventId(req) gives
   *    a number, otherwise chat.history(room).
   * 4. Event format (each event ends with a blank line):
   *      message:  id: <message.id>\nevent: message\ndata: <ChatMessage JSON>\n\n
   *      presence: event: presence\ndata: {"room","user","change"}\n\n   (no id!)
   * 5. Every keepAliveMs write the comment ": keep-alive\n\n".
   * 6. When the client disconnects (req "close"), clear the timer and
   *    unsubscribe. Careful: it can disconnect while the backfill is loading.
   */
  router.get("/:room/events", async (_req, _res) => {
    throw new HttpError(501, "NOT_IMPLEMENTED", "TODO(9)");
  });

  return router;
}

function parseRoom(value: unknown): string {
  const result = RoomName.safeParse(value);
  if (!result.success) throw new HttpError(400, "INVALID_ROOM", "room must match ^[a-z0-9][a-z0-9-]{0,31}$");
  return result.data;
}

/**
 * EventSource sends the `Last-Event-ID` header automatically when it
 * reconnects. `?lastEventId=` lets a client resume on its very first
 * connection too (e.g. after a page reload, from an id kept in localStorage).
 */
export function parseLastEventId(req: Request): number | undefined {
  const raw = req.get("last-event-id") ?? (typeof req.query.lastEventId === "string" ? req.query.lastEventId : undefined);
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}
