import type { RequestHandler, Response } from "express";
import type { PublicUser, Role } from "../domain/user.js";
import { UnauthenticatedError } from "../domain/errors.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { SessionStore } from "../sessions/sessionStore.js";

export interface AuthenticateDeps {
  sessions: SessionStore;
  users: UserRepository;
}

/**
 * TODO(5a): authenticate() runs on EVERY request (see app.ts). It never rejects
 * a request on its own; it only figures out who is calling:
 *
 *   - read the session id from the `sid` cookie (parseCookies + SESSION_COOKIE
 *     from lib/sessionCookie.ts)
 *   - look the session up (sessions.get); unknown/expired -> anonymous
 *   - load the user from the database by session.userId. Load it fresh on every
 *     request so role changes and deleted accounts take effect immediately.
 *     If the user no longer exists, destroy the session and treat as anonymous.
 *   - on success: res.locals.user = toPublicUser(user); res.locals.sessionId = session.id
 *   - always call next()
 */
export function authenticate(_deps: AuthenticateDeps): RequestHandler {
  // Placeholder: treats every request as anonymous. Replace it.
  return (_req, _res, next) => {
    next();
  };
}

/** The authenticated user, or throws UnauthenticatedError. Controllers use this. */
export function currentUser(res: Response): PublicUser {
  const user = res.locals.user as PublicUser | undefined;
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Rejects anonymous requests with 401. */
export const requireAuth: RequestHandler = (_req, res, next) => {
  currentUser(res);
  next();
};

/**
 * TODO(5b): requireRole(...roles) returns middleware that
 *   - throws UnauthenticatedError (401) when nobody is logged in
 *   - throws ForbiddenError (403) when the user's role is not in `roles`
 *   - calls next() otherwise
 */
export function requireRole(..._roles: Role[]): RequestHandler {
  return (_req, _res, _next) => {
    throw new Error("Not implemented: TODO(5b) requireRole");
  };
}
