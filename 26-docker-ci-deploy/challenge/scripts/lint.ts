/** Runner for scripts/lintRules.ts: `npm run lint`. Exits non-zero when there are problems. */
import { lint } from "./lintRules.js";

const problems = await lint();
if (problems.length) {
  process.stderr.write(problems.join("\n") + `\n\n${problems.length} lint problem(s)\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("lint: ok\n");
}
