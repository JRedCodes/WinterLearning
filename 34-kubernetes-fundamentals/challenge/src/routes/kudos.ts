import { Router } from "express";
import { HttpError } from "../lib/httpError.js";
import type { KudosService } from "../services/kudosService.js";

function parseLimit(raw: unknown): number {
  if (raw === undefined) return 20;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new HttpError(400, "VALIDATION_ERROR", "limit must be an integer", [{ path: "limit", message: "integer 1–100" }]);
  }
  const n = Number(raw);
  if (n < 1 || n > 100) {
    throw new HttpError(400, "VALIDATION_ERROR", "limit out of range", [{ path: "limit", message: "integer 1–100" }]);
  }
  return n;
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", `${field} must be a string`, [{ path: field, message: "required string" }]);
  }
  return value;
}

/** HTTP only: parse the request, call the service, shape the response. */
export function kudosRouter(service: KudosService): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const data = await service.recent(parseLimit(req.query.limit));
    res.json({ data });
  });

  router.get("/:id", async (req, res) => {
    res.json({ data: await service.get(req.params.id) });
  });

  router.post("/", async (req, res) => {
    const body: Record<string, unknown> = typeof req.body === "object" && req.body !== null ? req.body : {};
    const kudos = await service.give({
      from: requireString(body, "from"),
      to: requireString(body, "to"),
      message: requireString(body, "message"),
    });
    res.status(201).location(`/kudos/${kudos.id}`).json({ data: kudos });
  });

  return router;
}
