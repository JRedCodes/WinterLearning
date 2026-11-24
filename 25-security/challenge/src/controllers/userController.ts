import type { RequestHandler } from "express";
import { ValidationError } from "../domain/errors.js";
import type { User } from "../domain/types.js";
import { isValidEmail } from "../lib/validation.js";
import type { UserService } from "../services/userService.js";

const publicUser = (u: User) => ({ id: u.id, email: u.email, displayName: u.displayName, isAdmin: u.isAdmin });

export function userController(service: UserService) {
  const me: RequestHandler = async (_req, res) => {
    res.json({ data: publicUser(res.locals.user as User) });
  };

  const updateMe: RequestHandler = async (req, res) => {
    const user = res.locals.user as User;
    const body = req.body as Record<string, unknown>;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ValidationError("Expected an object");
    if (body.email !== undefined && (typeof body.email !== "string" || !isValidEmail(body.email))) {
      throw new ValidationError("invalid email");
    }
    if (body.displayName !== undefined && (typeof body.displayName !== "string" || body.displayName.length > 100)) {
      throw new ValidationError("invalid displayName");
    }
    const updated = await service.updateProfile(user.id, { ...body });
    res.json({ data: publicUser(updated) });
  };

  const getSettings: RequestHandler = async (_req, res) => {
    const user = await service.get((res.locals.user as User).id);
    res.json({ data: user.settings });
  };

  const updateSettings: RequestHandler = async (req, res) => {
    const body = req.body as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ValidationError("Expected an object");
    const settings = await service.updateSettings((res.locals.user as User).id, body as Record<string, unknown>);
    res.json({ data: settings });
  };

  const listUsers: RequestHandler = async (_req, res) => {
    res.json({ data: (await service.listAll()).map(publicUser) });
  };

  return { me, updateMe, getSettings, updateSettings, listUsers };
}
