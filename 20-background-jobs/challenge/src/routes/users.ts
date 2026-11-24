import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import type { SignupService } from "../services/signupService.js";

const SignupBody = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(100),
  avatarUrl: z.string().max(2000).optional(),
});

export function usersRouter(signup: SignupService) {
  const router = Router();

  router.post("/signup", async (req, res) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_FAILED", parsed.error.issues.map((i) => i.message).join("; "));
    }
    const { user, jobs } = await signup.signup(parsed.data);
    // 201: the user exists now. The jobs are listed so a client could poll them.
    res.status(201).location(`/users/${user.id}`).json({ data: user, jobs });
  });

  router.get("/users/:id", async (req, res) => {
    const user = await signup.getUser(req.params.id);
    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
    res.json({ data: user });
  });

  return router;
}
