import type { RequestHandler } from "express";
import type { UserDirectory } from "../repositories/userDirectory.js";
import { HttpError } from "../lib/httpError.js";

/**
 * Stand-in authentication: the gateway puts the caller's user id in
 * X-User-Id (real auth arrives in module 22). Attaches req.user.
 */
export function authenticate(users: UserDirectory): RequestHandler {
  return async (req, _res, next) => {
    const id = req.get("x-user-id");
    if (!id) throw new HttpError(401, "UNAUTHENTICATED", "Missing X-User-Id header");
    const user = await users.findById(id);
    (req as any).user = { id: user.id, role: user.role };
    next();
  };
}

export function requireRole(role: string): RequestHandler {
  return (req, _res, next) => {
    if ((req as any).user?.role !== role) {
      throw new HttpError(403, "FORBIDDEN", `Requires role: ${role}`);
    }
    next();
  };
}
