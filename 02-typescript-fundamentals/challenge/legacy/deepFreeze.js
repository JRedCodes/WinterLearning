// Recursively freezes an object so config/constants can't be mutated by accident.
// NOTE: crashed with "Maximum call stack size exceeded" on objects with cycles.
export function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") deepFreeze(value);
  }
  return Object.freeze(obj);
}
