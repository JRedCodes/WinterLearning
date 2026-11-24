// groupBy([{ role: "admin" }, { role: "member" }], (u) => u.role)
//   → { admin: [...], member: [...] }
// NOTE: callers often assumed every possible key exists in the result
// (`groups.admin.length`) even when there were no admins.
export function groupBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}
