/**
 * Composition root. Config is loaded FIRST: if the environment is wrong, the
 * process prints every problem and exits before it binds a port or touches
 * anything else.
 */
import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { createContainer } from "./container.js";

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const deps = createContainer({ config });
  const app = createApp(deps);
  const server = app.listen(config.port, () => {
    deps.logger.info("catalog api listening", { port: config.port, env: config.env });
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      deps.logger.info("shutting down", { signal });
      server.close(() => process.exit(0));
    });
  }
}

main();
