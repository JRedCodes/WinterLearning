export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** A user as stored. Contains the password hash: never send this object to a client. */
export interface User {
  id: string;
  email: string;
  role: Role;
  passwordHash: string;
  createdAt: Date;
}

/** What the outside world is allowed to see about a user. */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

/**
 * Allowlist, not denylist: we copy the fields we want instead of deleting the
 * ones we don't. A new column added to `users` later stays private by default.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Emails are compared case-insensitively, so we store them normalized. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
