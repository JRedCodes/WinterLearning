import type { PublicUser } from "../domain/user.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { SessionStore } from "../sessions/sessionStore.js";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

export interface AuthServiceDeps {
  users: UserRepository;
  sessions: SessionStore;
  hasher: PasswordHasher;
}

export interface LoginResult {
  user: PublicUser;
  sessionId: string;
}

/**
 * TODO(4): The authentication use cases. No Express in here: the controller
 * deals with cookies and status codes, this class deals with rules.
 *
 * register(email, password)
 *   - normalize the email (normalizeEmail in domain/user.ts)
 *   - hash the password, create the user with role "user"
 *   - a duplicate email surfaces as EmailTakenError (the repository already throws it)
 *   - return the PUBLIC user (toPublicUser), never the hash
 *
 * login(email, password, previousSessionId?)
 *   - unknown email and wrong password must be indistinguishable to the caller:
 *     throw InvalidCredentialsError in both cases, AND spend the same time in both
 *     cases: when the user doesn't exist, still run hasher.verify against a dummy
 *     hash (compute one dummy hash once, lazily, and reuse it)
 *   - on success, create a NEW session (never reuse an id the client sent us: that
 *     is session fixation). If previousSessionId was given, destroy it.
 *   - return { user: PublicUser, sessionId }
 *
 * logout(sessionId) -> destroy that session
 * logoutEverywhere(userId) -> destroy all of the user's sessions
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async register(_email: string, _password: string): Promise<PublicUser> {
    throw new Error("Not implemented: TODO(4) AuthService.register");
  }

  async login(_email: string, _password: string, _previousSessionId?: string): Promise<LoginResult> {
    throw new Error("Not implemented: TODO(4) AuthService.login");
  }

  async logout(_sessionId: string): Promise<void> {
    throw new Error("Not implemented: TODO(4) AuthService.logout");
  }

  async logoutEverywhere(_userId: string): Promise<void> {
    throw new Error("Not implemented: TODO(4) AuthService.logoutEverywhere");
  }
}
