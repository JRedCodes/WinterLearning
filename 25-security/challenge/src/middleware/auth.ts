import type { RequestHandler } from "express";
import { ForbiddenError, UnauthenticatedError } from "../domain/errors.js";
import type { User } from "../domain/types.js";
import { hashToken } from "../lib/tokens.js";
import type { UserRepository } from "../repositories/userRepository.js";

/** Resolves `Authorization: Bearer <token>` to a user and stores it on res.locals.user. */
export function authenticate(users: UserRepository): RequestHandler {
  return async (req, res, next) => {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9._-]{1,200})$/.exec(header);
    if (!match) throw new UnauthenticatedError();
    const user = await users.findByTokenHash(hashToken(match[1]!));
    if (!user) throw new UnauthenticatedError();
    res.locals.user = user;
    next();
  };
}

export const requireAdmin: RequestHandler = (_req, res, next) => {
  const user = res.locals.user as User | undefined;
  if (!user?.isAdmin) throw new ForbiddenError();
  next();
};
