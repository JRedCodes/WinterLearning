import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "../src/hooks/useLocalStorage";

const KEY = "wl:R1:test";

/** What another browser tab writing to the same key looks like to this tab. */
function storageEventFromAnotherTab(key: string, newValue: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: window.localStorage }));
  });
}

describe("useLocalStorage (TODO 2)", () => {
  it("returns the initial value when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorage(KEY, { count: 0 }));
    expect(result.current[0]).toEqual({ count: 0 });
  });

  it("reads an existing stored value on first render", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ count: 7 }));
    const { result } = renderHook(() => useLocalStorage(KEY, { count: 0 }));
    expect(result.current[0]).toEqual({ count: 7 });
  });

  it("falls back to the initial value when the stored text is not valid JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useLocalStorage(KEY, "fallback"));
    expect(result.current[0]).toBe("fallback");
  });

  it("reads localStorage only once, not on every render", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const { rerender } = renderHook(() => useLocalStorage(KEY, 1));
    rerender();
    rerender();
    expect(getItem.mock.calls.filter(([k]) => k === KEY).length).toBe(1);
    getItem.mockRestore();
  });

  it("setValue updates the state and writes JSON to localStorage", () => {
    const { result } = renderHook(() => useLocalStorage(KEY, ["a"]));
    act(() => result.current[1](["a", "b"]));
    expect(result.current[0]).toEqual(["a", "b"]);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual(["a", "b"]);
  });

  it("setValue accepts an updater function", () => {
    const { result } = renderHook(() => useLocalStorage(KEY, 1));
    act(() => {
      result.current[1]((n) => n + 1);
      result.current[1]((n) => n + 1); // both updates must apply
    });
    expect(result.current[0]).toBe(3);
    expect(window.localStorage.getItem(KEY)).toBe("3");
  });

  it("the value survives a 'reload' (unmount + mount again)", () => {
    const first = renderHook(() => useLocalStorage(KEY, "draft"));
    act(() => first.result.current[1]("saved"));
    first.unmount();
    const second = renderHook(() => useLocalStorage(KEY, "draft"));
    expect(second.result.current[0]).toBe("saved");
  });

  it("syncs when another tab changes the same key", () => {
    const { result } = renderHook(() => useLocalStorage(KEY, 0));
    storageEventFromAnotherTab(KEY, "42");
    expect(result.current[0]).toBe(42);
  });

  it("goes back to the initial value when another tab removes the key", () => {
    window.localStorage.setItem(KEY, "5");
    const { result } = renderHook(() => useLocalStorage(KEY, 0));
    storageEventFromAnotherTab(KEY, null);
    expect(result.current[0]).toBe(0);
  });

  it("ignores storage events for other keys and invalid JSON", () => {
    const { result } = renderHook(() => useLocalStorage(KEY, 1));
    storageEventFromAnotherTab("some-other-key", "99");
    storageEventFromAnotherTab(KEY, "{broken");
    expect(result.current[0]).toBe(1);
  });

  it("removes its storage listener on unmount (effect cleanup)", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useLocalStorage(KEY, 0));
    const added = add.mock.calls.filter(([type]) => type === "storage");
    expect(added.length, "expected the hook to listen for 'storage' events").toBeGreaterThan(0);
    unmount();
    const removed = remove.mock.calls.filter(([type]) => type === "storage");
    expect(removed.map(([, fn]) => fn)).toEqual(expect.arrayContaining(added.map(([, fn]) => fn)));
    add.mockRestore();
    remove.mockRestore();
  });

  it("keeps the setter identity stable across renders", () => {
    const { result, rerender } = renderHook(() => useLocalStorage(KEY, 0));
    const firstSetter = result.current[1];
    act(() => result.current[1](1));
    rerender();
    expect(result.current[1]).toBe(firstSetter);
  });
});
