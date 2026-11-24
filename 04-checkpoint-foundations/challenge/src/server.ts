// Entry point for `npm run dev`. Wire up createKvServer, listen on PORT, and
// call close() on SIGINT/SIGTERM so pending writes are flushed before exit.
import { createKvServer } from "./index.js";

const port = Number(process.env.PORT ?? 3000);
const dataFile = process.env.DATA_FILE ?? "./data/kv.json";

const kv = await createKvServer({ dataFile });
const actual = await kv.listen(port);
console.log(`kv-lite listening on http://localhost:${actual} (data: ${dataFile})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`${signal} received, flushing and shutting down`);
    kv.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("shutdown failed", error);
        process.exit(1);
      },
    );
  });
}
