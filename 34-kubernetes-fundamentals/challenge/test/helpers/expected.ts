/** The object names CHALLENGE.md asks for. Tests look objects up by kind + name. */
export const NAMES = {
  configMap: "kudos-config",
  secret: "kudos-db",
  api: "kudos-api", // Deployment AND Service
  postgres: "postgres", // StatefulSet (or Deployment) AND Service
  migrateJob: "kudos-migrate",
} as const;

export const IMAGE_REPO = "wl-kudos-api";

/** Env vars the API and the migration Job need in the cluster (defaults point at localhost). */
export const REQUIRED_DB_ENV = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const;
