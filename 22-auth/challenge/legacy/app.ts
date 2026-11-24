import express, { type RequestHandler } from "express";
import { signToken, verifyToken, type TokenClaims } from "./lib/jwt.js";
import { checkPassword, hashPassword } from "./lib/passwords.js";
import { LegacyStore } from "./store.js";

export interface LegacyAppOptions {
  secret: string;
  store?: LegacyStore;
  /** Clock in milliseconds; injectable for tests. */
  now?: () => number;
  tokenTtlSeconds?: number;
}

export function createLegacyApp(opts: LegacyAppOptions) {
  const store = opts.store ?? new LegacyStore();
  const now = opts.now ?? Date.now;
  const nowSeconds = () => Math.floor(now() / 1000);
  const ttl = opts.tokenTtlSeconds ?? 15 * 60;

  const app = express();
  app.use(express.json());

  const requireToken: RequestHandler = (req, res, next) => {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const claims = token ? verifyToken(token, opts.secret, nowSeconds()) : null;
    if (!claims) {
      res.status(401).json({ error: "Invalid or missing token" });
      return;
    }
    res.locals.claims = claims;
    next();
  };

  const claimsOf = (res: express.Response) => res.locals.claims as TokenClaims;

  app.post("/register", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "email and password (8+ chars) are required" });
      return;
    }
    if (store.findUserByEmail(email)) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const user = store.addUser(email, await hashPassword(password));
    res.status(201).json({ id: user.id, email: user.email });
  });

  app.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    const user = store.findUserByEmail(email);
    if (!user) {
      res.status(404).json({ error: "No account found for that email" });
      return;
    }
    if (!(await checkPassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }
    const token = signToken({ sub: user.id, email: user.email }, opts.secret, {
      nowSeconds: nowSeconds(),
      ttlSeconds: ttl,
    });
    res.json({ token });
  });

  app.get("/me", requireToken, (_req, res) => {
    const { sub, email } = claimsOf(res);
    res.json({ id: sub, email });
  });

  app.post("/documents", requireToken, (req, res) => {
    const { title, body } = req.body ?? {};
    if (typeof title !== "string" || title.trim() === "") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const doc = store.addDocument(claimsOf(res).sub, title.trim(), typeof body === "string" ? body : "");
    res.status(201).json(doc);
  });

  app.get("/documents/:id", requireToken, (req, res) => {
    const doc = store.documents.get(String(req.params.id));
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  });

  return app;
}
