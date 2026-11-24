// pick({ a: 1, b: 2, c: 3 }, ["a", "c"]) → { a: 1, c: 3 }
// NOTE: a typo in a key name (["a", "cc"]) silently produced an object
// without that field.
export function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (key in obj) out[key] = obj[key];
  }
  return out;
}
