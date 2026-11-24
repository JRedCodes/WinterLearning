// Parses a config object that came from JSON.parse(fs.readFileSync(...)).
// NOTE: it throws on the FIRST problem, so users fixed their config one error
// at a time. It also accepted { port: "8080" } (a string) and logLevel "verbose".
const LOG_LEVELS = ["debug", "info", "warn", "error"];

export function parseConfig(input) {
  if (!input.port) throw new Error("port is required");
  return {
    port: input.port,
    host: input.host || "localhost",
    logLevel: input.logLevel || "info",
    features: input.features || [],
  };
}
