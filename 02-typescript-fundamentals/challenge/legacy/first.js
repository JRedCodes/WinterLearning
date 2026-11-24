// Returns the first element of an array.
// NOTE: on an empty array this returns undefined, and nothing warns the caller.
// Half the call sites in the old codebase did `first(list).name` and crashed
// in production on empty lists.
export function first(items) {
  return items[0];
}
