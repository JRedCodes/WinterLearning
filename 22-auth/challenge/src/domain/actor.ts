import type { Role } from "./user.js";

/**
 * "Who is doing this?" The service layer receives an Actor, never an Express
 * request. That keeps authorization rules testable without HTTP.
 */
export interface Actor {
  id: string;
  role: Role;
}
