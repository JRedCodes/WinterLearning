import { Router, type RequestHandler } from "express";
import { HttpError } from "../lib/httpError.js";

/**
 * A fake login endpoint, here only so we have a SENSITIVE route to protect.
 * (Real authentication is module 22.) The rate limiter is passed in as
 * middleware, so this router doesn't know which algorithm guards it.
 */
export function authRouter(loginGuard: RequestHandler) {
  const router = Router();

  router.post("/login", loginGuard, (req, res) => {
    const body: unknown = req.body;
    const username = typeof body === "object" && body !== null && "username" in body ? body.username : undefined;
    const password = typeof body === "object" && body !== null && "password" in body ? body.password : undefined;

    if (username === "ada" && password === "lovelace") {
      res.json({ data: { token: "demo-token" } });
      return;
    }
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid username or password");
  });

  return router;
}
