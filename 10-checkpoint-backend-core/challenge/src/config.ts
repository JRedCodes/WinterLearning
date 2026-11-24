/**
 * The only file allowed to read process.env (an architecture test checks).
 * loadConfig(env) must parse and validate the environment once and return
 * a typed object, or throw an error that names every invalid variable.
 */
export interface Config {
  port: number;
  nodeEnv: "development" | "test" | "production";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  void env;
  throw new Error("Not implemented: loadConfig (see CHALLENGE.md)");
}
