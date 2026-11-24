/**
 * Key naming helpers.
 *
 * Every key this module writes lives under the "wl:17:" namespace, so it can
 * share a Redis server with other apps (and other modules) without collisions,
 * and so the tests can wipe exactly this module's keys with SCAN + UNLINK.
 *
 *   key("views", "home")         -> "wl:17:views:home"
 *   key("session", "3f2a...")    -> "wl:17:session:3f2a..."
 *
 * Use this helper in every exercise instead of hand-building strings.
 */
export const KEY_PREFIX = "wl:17:";

export function key(...parts: Array<string | number>): string {
  return KEY_PREFIX + parts.join(":");
}
