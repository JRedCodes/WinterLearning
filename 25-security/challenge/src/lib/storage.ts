import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Stores file contents on disk:  <root>/<ownerId>/<fileName>
 * Metadata (owner, size, type) lives in Postgres; this class only does bytes.
 */
export class FileStorage {
  constructor(private readonly root: string) {}

  private pathFor(ownerId: number, name: string): string {
    return path.join(this.root, String(ownerId), name);
  }

  async write(ownerId: number, name: string, content: Buffer): Promise<void> {
    const file = this.pathFor(ownerId, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }

  /** Returns undefined if the file doesn't exist. */
  async read(ownerId: number, name: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.pathFor(ownerId, name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "EISDIR") {
        return undefined;
      }
      throw err;
    }
  }
}
