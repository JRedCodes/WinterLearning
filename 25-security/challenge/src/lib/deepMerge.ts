type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively merges `source` into `target` and returns `target`.
 * Used for partial settings updates: PUT {"notifications":{"email":false}}
 * changes one flag without wiping the rest of the settings object.
 */
export function deepMerge(target: Json, source: Json): Json {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (isObject(value)) {
      if (!isObject(target[key])) target[key] = {};
      deepMerge(target[key] as Json, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
