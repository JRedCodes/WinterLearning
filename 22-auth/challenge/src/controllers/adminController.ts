import type { Request, Response } from "express";
import type { UserService } from "../services/userService.js";

export function adminController(users: UserService) {
  return {
    async listUsers(_req: Request, res: Response) {
      res.json({ data: await users.listUsers() });
    },
  };
}
