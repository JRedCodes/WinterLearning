import { useState } from "react";

/**
 * TODO(2): useState that survives a page reload.
 *
 *   const [value, setValue] = useLocalStorage("some-key", initialValue);
 *
 *  - On first render, read localStorage[key] and JSON.parse it. If the key is
 *    missing OR the stored text isn't valid JSON, use `initialValue`.
 *    Read storage only ONCE (lazy initial state), not on every render.
 *  - `setValue` accepts a value or an updater function, exactly like the
 *    setter from useState, and writes the new value to localStorage as JSON.
 *  - Keep other tabs in sync: listen for the window "storage" event. When an
 *    event arrives for this key, update the state from event.newValue
 *    (null newValue means the key was removed -> back to `initialValue`;
 *    invalid JSON -> ignore the event).
 *    Remove the listener when the component unmounts (effect cleanup).
 *
 * The current version is plain useState: it forgets everything on reload.
 */
export function useLocalStorage<T>(
  _key: string,
  initialValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initialValue);
  return [value, setValue];
}
