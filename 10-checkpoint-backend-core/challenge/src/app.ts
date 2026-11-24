import type { Express } from "express";

/**
 * The acceptance tests import exactly this: `createApp({ clock })`.
 * Everything behind it (structure, files, names) is your design.
 * See CHALLENGE.md for the API contract.
 */

/** Anything that can tell the time. Tests pass one they control. */
export interface Clock {
  now(): Date;
}

export interface AppDeps {
  clock: Clock;
}

export function createApp(deps: AppDeps): Express {
  void deps;
  throw new Error("Not implemented: build the habit tracker API (see CHALLENGE.md)");
}
