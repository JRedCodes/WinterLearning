import { describe, expect, it } from "vitest";
import { clearSessionCookie, parseCookies, serializeSessionCookie } from "../src/lib/sessionCookie.js";

const attrs = (header: string) => header.split(";").map((p) => p.trim());

describe("TODO(3) · session cookie", () => {
  it("sets the value and the protective attributes", () => {
    const header = serializeSessionCookie("abc123", { secure: false, maxAgeSeconds: 600 });
    const parts = attrs(header);
    expect(parts[0]).toBe("sid=abc123");
    expect(parts).toContain("HttpOnly");
    expect(parts).toContain("Path=/");
    expect(parts).toContain("SameSite=Lax");
    expect(parts).toContain("Max-Age=600");
    expect(parts, "Secure must only be set when secure: true").not.toContain("Secure");
  });

  it("adds Secure when configured", () => {
    const parts = attrs(serializeSessionCookie("abc123", { secure: true, maxAgeSeconds: 600 }));
    expect(parts).toContain("Secure");
  });

  it("clears the cookie with an empty value, Max-Age=0 and the same attributes", () => {
    const parts = attrs(clearSessionCookie({ secure: true }));
    expect(parts[0]).toBe("sid=");
    expect(parts).toContain("Max-Age=0");
    expect(parts).toContain("Path=/");
    expect(parts).toContain("HttpOnly");
    expect(parts).toContain("SameSite=Lax");
    expect(parts).toContain("Secure");
  });

  it("round-trips through parseCookies", () => {
    const value = serializeSessionCookie("x_Y-z", { secure: false, maxAgeSeconds: 1 }).split(";")[0]!;
    expect(parseCookies(`theme=dark; ${value}`)).toEqual({ theme: "dark", sid: "x_Y-z" });
  });
});
