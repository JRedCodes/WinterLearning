import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { FileRecord } from "../domain/types.js";
import type { FileStorage } from "../lib/storage.js";
import type { UrlImporter } from "../lib/urlImporter.js";
import type { FileRepository } from "../repositories/fileRepository.js";

export class FileService {
  constructor(
    private readonly files: FileRepository,
    private readonly storage: FileStorage,
    private readonly importer: UrlImporter,
  ) {}

  list(ownerId: number, search?: string): Promise<FileRecord[]> {
    return this.files.search(ownerId, search);
  }

  async upload(ownerId: number, name: string, content: Buffer, contentType: string): Promise<FileRecord> {
    if (await this.files.findByName(ownerId, name)) throw new ConflictError(`You already have a file named ${name}`);
    await this.storage.write(ownerId, name, content);
    return this.files.create({ ownerId, name, sizeBytes: content.length, contentType });
  }

  async download(ownerId: number, name: string): Promise<{ content: Buffer; contentType: string }> {
    const content = await this.storage.read(ownerId, name);
    if (!content) throw new NotFoundError("File not found");
    const meta = await this.files.findByName(ownerId, name);
    return { content, contentType: meta?.contentType ?? "application/octet-stream" };
  }

  async importFromUrl(ownerId: number, name: string, url: string): Promise<FileRecord> {
    const { content, contentType } = await this.importer.download(url);
    return this.upload(ownerId, name, content, contentType);
  }
}
