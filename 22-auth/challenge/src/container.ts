import type { Redis } from "ioredis";
import type pg from "pg";
import type { Config } from "./config.js";
import type { CookieSettings } from "./controllers/authController.js";
import { hashPassword, verifyPassword } from "./lib/password.js";
import { PgDocumentRepository } from "./repositories/documentRepository.js";
import { PgUserRepository, type UserRepository } from "./repositories/userRepository.js";
import { AuthService } from "./services/authService.js";
import { DocumentService } from "./services/documentService.js";
import { UserService } from "./services/userService.js";
import { RedisSessionStore, type SessionStore } from "./sessions/sessionStore.js";

export interface Container {
  users: UserRepository;
  sessions: SessionStore;
  authService: AuthService;
  documentService: DocumentService;
  userService: UserService;
  cookie: CookieSettings;
}

/** Wires concrete implementations together. Used by server.ts and by the tests. */
export function buildContainer(deps: {
  pool: pg.Pool;
  redis: Redis;
  config: Pick<Config, "redisKeyPrefix" | "sessionTtlSeconds" | "cookieSecure">;
}): Container {
  const { pool, redis, config } = deps;
  const users = new PgUserRepository(pool);
  const documents = new PgDocumentRepository(pool);
  const sessions = new RedisSessionStore(redis, {
    prefix: config.redisKeyPrefix,
    ttlSeconds: config.sessionTtlSeconds,
  });
  return {
    users,
    sessions,
    authService: new AuthService({ users, sessions, hasher: { hash: hashPassword, verify: verifyPassword } }),
    documentService: new DocumentService(documents),
    userService: new UserService(users),
    cookie: { secure: config.cookieSecure, maxAgeSeconds: config.sessionTtlSeconds },
  };
}
