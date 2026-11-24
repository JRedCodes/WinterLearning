import type { UserId } from "./ids.js";

export type Role = "customer" | "warehouse";

export interface User {
  id: UserId;
  name: string;
  role: Role;
}

/** What the auth middleware attaches to the request. */
export interface AuthUser {
  id: UserId;
  role: Role;
}
