import { BlockedUrlError, UpstreamError } from "../domain/errors.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
/** Resolves a hostname to its IP addresses (both IPv4 and IPv6). */
export type ResolveHost = (hostname: string) => Promise<string[]>;

export interface ImportedContent {
  content: Buffer;
  contentType: string;
}

const MAX_IMPORT_BYTES = 1_000_000;

/**
 * Downloads a remote file for "import from URL".
 * The network functions are injected so tests never touch the real network.
 */
export class UrlImporter {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly resolveHost: ResolveHost,
  ) {}

  async download(rawUrl: string): Promise<ImportedContent> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BlockedUrlError("Not a valid URL");
    }

    // Fail fast with a clear message for typos in the hostname.
    const addresses = await this.resolveHost(url.hostname);
    if (addresses.length === 0) throw new BlockedUrlError(`Cannot resolve ${url.hostname}`);

    const res = await this.fetchImpl(url.toString(), { signal: AbortSignal.timeout(5000) });
    const content = Buffer.from(await res.arrayBuffer());
    if (content.length > MAX_IMPORT_BYTES) throw new UpstreamError("Remote file is too large");
    return { content, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }
}
