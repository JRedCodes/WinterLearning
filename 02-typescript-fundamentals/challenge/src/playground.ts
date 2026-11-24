// Scratch file for experiments: `npm run dev` re-runs it on every save.
// Hover over things in your editor to see their inferred types, and try
// breaking things on purpose to read the compiler errors.
import { groupBy, parseConfig } from "./index.js";

const users = [
  { name: "Ada", role: "admin" as const },
  { name: "Linus", role: "member" as const },
];

try {
  console.log(groupBy(users, (u) => u.role));
  console.log(parseConfig(JSON.parse('{"port": 8080, "logLevel": "debug"}')));
} catch (error) {
  console.log("Not implemented yet:", (error as Error).message);
}
