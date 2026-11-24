// Composition root: load config, create the real dependencies, call
// createApp(...) and listen. Add graceful shutdown on SIGINT/SIGTERM.
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ clock: { now: () => new Date() } });

app.listen(config.port, () => {
  console.log(`habit tracker listening on http://localhost:${config.port}`);
});
