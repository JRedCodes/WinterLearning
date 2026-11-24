/**
 * Thrown when a message can NEVER be processed successfully (malformed,
 * unknown schema version, violates an invariant). Retrying is pointless:
 * it should go straight to the dead-letter topic.
 *
 * Anything else that's thrown is treated as possibly transient (database
 * timeout, network blip) and is worth retrying.
 */
export class PermanentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PermanentError";
  }
}
