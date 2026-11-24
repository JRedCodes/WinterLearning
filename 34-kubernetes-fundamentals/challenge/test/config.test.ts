/** TODO 2: ConfigMap and Secret. */
import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config.js";
import { NAMES } from "./helpers/expected.js";
import { loadManifests, mustFind } from "./helpers/manifests.js";

const docs = loadManifests();
const APP_ENV = Object.keys(EnvSchema.shape);

describe(`ConfigMap ${NAMES.configMap} (TODO 2)`, () => {
  it("exists and holds the non-secret DB settings", () => {
    const cm = mustFind(docs, "ConfigMap", NAMES.configMap);
    for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER"]) {
      expect(cm.data?.[key], `ConfigMap is missing ${key}`).toBeDefined();
    }
  });

  it("only contains keys the app actually reads (typos would be silently ignored)", () => {
    const cm = mustFind(docs, "ConfigMap", NAMES.configMap);
    for (const key of Object.keys(cm.data ?? {})) {
      expect(APP_ENV, `ConfigMap key "${key}" is not read by src/config.ts`).toContain(key);
    }
  });

  it("every value is a string (quote numbers: DB_PORT: \"5432\")", () => {
    const cm = mustFind(docs, "ConfigMap", NAMES.configMap);
    for (const [key, value] of Object.entries(cm.data ?? {})) {
      expect(typeof value, `ConfigMap ${key} parsed as ${typeof value}; ConfigMap data values must be strings`).toBe("string");
    }
  });

  it("does not contain secrets", () => {
    const cm = mustFind(docs, "ConfigMap", NAMES.configMap);
    for (const key of Object.keys(cm.data ?? {})) {
      expect(key, `${key} looks like a secret: put it in the Secret`).not.toMatch(/PASSWORD|SECRET|TOKEN/i);
    }
  });
});

describe(`Secret ${NAMES.secret} (TODO 2)`, () => {
  it("is an Opaque Secret with a DB_PASSWORD key", () => {
    const s = mustFind(docs, "Secret", NAMES.secret);
    expect(s.type ?? "Opaque").toBe("Opaque");
    const keys = [...Object.keys(s.data ?? {}), ...Object.keys(s.stringData ?? {})];
    expect(keys, "Secret needs a DB_PASSWORD key (in stringData or data)").toContain("DB_PASSWORD");
  });

  it("values under `data` are valid base64 (or use `stringData` for plain text)", () => {
    const s = mustFind(docs, "Secret", NAMES.secret);
    for (const [key, value] of Object.entries(s.data ?? {})) {
      const str = String(value);
      expect(str, `Secret data.${key} is not base64. Use stringData for plain text.`).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(Buffer.from(Buffer.from(str, "base64").toString("utf8")).toString("base64")).toBe(str);
    }
  });
});
