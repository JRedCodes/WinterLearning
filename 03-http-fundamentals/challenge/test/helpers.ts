import { expect } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/app.js";
import type { ServerOptions } from "../src/types.js";

export interface TestServer {
  /** e.g. "http://127.0.0.1:54321" */
  readonly base: string;
  close(): Promise<void>;
}

/** Starts the server on a random free port (port 0) and returns its base URL. */
export async function startServer(options: ServerOptions = {}): Promise<TestServer> {
  const server = createServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export interface ErrorBody {
  error: { code: string; message: string };
}

export async function readError(res: Response): Promise<ErrorBody> {
  expect(res.headers.get("content-type"), "error responses must be JSON").toMatch(/^application\/json/);
  const body = (await res.json()) as ErrorBody;
  expect(body.error?.code, `error body should be { error: { code, message } }, got ${JSON.stringify(body)}`).toEqual(
    expect.any(String),
  );
  expect(body.error.message).toEqual(expect.any(String));
  return body;
}
