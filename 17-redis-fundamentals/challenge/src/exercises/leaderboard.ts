import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 3 · Leaderboard (SORTED SET)
 *
 * Key: wl:17:leaderboard:<board>   (members = player ids, scores = points)
 *
 * Why a sorted set: it keeps members ordered by score at all times, so
 * "top 10" and "what's my rank?" are O(log N) instead of sorting a table on
 * every request.
 */
export interface LeaderboardEntry {
  player: string;
  score: number;
  /** 1-based: the highest score has rank 1. */
  rank: number;
}

/** Add `points` to the player's score (creating it if needed). Returns the new score. */
export async function addScore(
  redis: Redis,
  board: string,
  player: string,
  points: number,
): Promise<number> {
  throw new Error("Not implemented: addScore");
}

/**
 * The top `n` players, highest score first. n <= 0 returns [].
 * Do it in one command (hint: WITHSCORES). Remember range stops are inclusive.
 */
export async function topN(redis: Redis, board: string, n: number): Promise<LeaderboardEntry[]> {
  throw new Error("Not implemented: topN");
}

/** The player's 1-based rank (highest score = 1), or null if they're not on the board. */
export async function rankOf(redis: Redis, board: string, player: string): Promise<number | null> {
  throw new Error("Not implemented: rankOf");
}

void key;
