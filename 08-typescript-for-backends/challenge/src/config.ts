/** The only file that reads process.env. */
export function loadConfig(env: any = process.env) {
  return {
    port: Number(env.PORT ?? 3000),
    carrierBaseUrl: env.CARRIER_BASE_URL ?? "http://localhost:4010",
  };
}
