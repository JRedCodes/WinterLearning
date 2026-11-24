/**
 * The object graph of the app: which repository goes into which service,
 * which services go into the app.
 *
 * Right now the god file in app.ts creates (and hides) everything itself, so
 * this function has nothing to wire and the tests' `createApp(createContainer())`
 * calls just get an empty object that app.ts ignores.
 *
 * During the refactor this becomes the place where the real implementations
 * are chosen and connected. See "Target structure" in CHALLENGE.md.
 */
export function createContainer(_overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {};
}
