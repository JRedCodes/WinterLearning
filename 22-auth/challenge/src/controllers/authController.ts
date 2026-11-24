import type { Request, Response } from "express";
import { z } from "zod";
import { parseInput } from "../lib/validate.js";
import { clearSessionCookie, parseCookies, SESSION_COOKIE, serializeSessionCookie } from "../lib/sessionCookie.js";
import { currentUser } from "../middleware/authenticate.js";
import type { AuthService } from "../services/authService.js";

const RegisterBody = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  // Length, not composition rules: long passphrases beat "P@ssw0rd!" (NIST SP 800-63B).
  // The upper bound stops someone from making us hash a 10 MB "password".
  password: z.string().min(12, "Password must be at least 12 characters").max(128),
});

const LoginBody = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

export interface CookieSettings {
  secure: boolean;
  maxAgeSeconds: number;
}

/** HTTP adapter for AuthService: parse input, call the service, shape the response (incl. cookies). */
export function authController(auth: AuthService, cookie: CookieSettings) {
  return {
    async register(req: Request, res: Response) {
      const { email, password } = parseInput(RegisterBody, req.body);
      const user = await auth.register(email, password);
      res.status(201).json({ data: user });
    },

    async login(req: Request, res: Response) {
      const { email, password } = parseInput(LoginBody, req.body);
      const previous = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const { user, sessionId } = await auth.login(email, password, previous);
      res.setHeader("Set-Cookie", serializeSessionCookie(sessionId, cookie));
      res.json({ data: user });
    },

    async logout(_req: Request, res: Response) {
      const sessionId = res.locals.sessionId as string | undefined;
      if (sessionId) await auth.logout(sessionId);
      res.setHeader("Set-Cookie", clearSessionCookie(cookie));
      res.status(204).end();
    },

    async logoutEverywhere(_req: Request, res: Response) {
      const user = currentUser(res);
      await auth.logoutEverywhere(user.id);
      res.setHeader("Set-Cookie", clearSessionCookie(cookie));
      res.status(204).end();
    },

    async me(_req: Request, res: Response) {
      res.json({ data: currentUser(res) });
    },
  };
}
