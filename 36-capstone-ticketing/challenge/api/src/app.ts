import type express from "express";
import type { Container } from "./container.js";

/**
 * Builds the Express app from an already-wired Container.
 * No listen(), no process.env, no `new Pool()` in here.
 */
export function createApp(container: Container): express.Express {
  void container;
  throw new Error("Not implemented: createApp (start with M1 in CHALLENGE.md)");
}
