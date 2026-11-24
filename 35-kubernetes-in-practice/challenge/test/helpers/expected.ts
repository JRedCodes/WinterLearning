/** Object names in broken/ (they're already right: the bugs are elsewhere). */
export const NAMES = {
  namespace: "kudos",
  configMap: "kudos-config",
  secret: "kudos-db",
  api: "kudos-api", // Deployment, Service, Ingress, HPA and PDB all share this name
} as const;

export const APP_PORT = 3000;
