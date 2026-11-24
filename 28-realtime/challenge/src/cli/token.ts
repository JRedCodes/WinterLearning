import { signToken } from "../auth/tokens.js";
import { loadConfig } from "../config.js";

// Usage: npm run token -- alice
const user = process.argv[2];
if (!user) {
  console.error("usage: npm run token -- <username>");
  process.exit(1);
}
console.log(signToken(user, loadConfig().tokenSecret));
