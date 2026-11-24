/** The slice of a `ws` WebSocket that safeSend needs. Small on purpose, so tests can fake it. */
export interface SendableSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** WebSocket.OPEN */
export const OPEN = 1;
/** "Try Again Later": the standard close code for an overloaded peer. */
export const CLOSE_SLOW_CONSUMER = 1013;

export type SendResult = "sent" | "skipped" | "overloaded";

/**
 * TODO(3): send a frame without letting a slow client eat our memory.
 *
 * `bufferedAmount` is how many bytes `ws` has queued in memory because the
 * client isn't reading fast enough.
 *
 * - Socket not OPEN → do nothing, return "skipped".
 * - bufferedAmount + the frame's size IN BYTES > maxBufferedBytes →
 *   close(CLOSE_SLOW_CONSUMER, "slow consumer"), return "overloaded".
 * - Otherwise send it and return "sent".
 */
export function safeSend(socket: SendableSocket, data: string, maxBufferedBytes: number): SendResult {
  throw new Error("Not implemented");
}
