// Entry point for `npm run check`. All the logic lives in checkServices.ts so it can be tested
// without starting a process. This file only connects that logic to the real world.
import { main } from "./checkServices.js";

process.exitCode = await main();
