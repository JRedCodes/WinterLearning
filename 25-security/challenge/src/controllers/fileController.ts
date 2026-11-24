import type { RequestHandler } from "express";
import { z } from "zod";
import { ValidationError } from "../domain/errors.js";
import type { User } from "../domain/types.js";
import { FILE_NAME_PATTERN } from "../lib/validation.js";
import type { FileService } from "../services/fileService.js";

const FileName = z.string().regex(FILE_NAME_PATTERN, "invalid file name");
const UploadBody = z.object({
  name: FileName,
  content: z.string().max(500_000),
  contentType: z.string().max(100).default("text/plain"),
});
const ImportBody = z.object({ name: FileName, url: z.string().max(2000) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}

export function fileController(service: FileService) {
  const list: RequestHandler = async (req, res) => {
    const user = res.locals.user as User;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json({ data: await service.list(user.id, search) });
  };

  const upload: RequestHandler = async (req, res) => {
    const user = res.locals.user as User;
    const body = parse(UploadBody, req.body);
    const file = await service.upload(user.id, body.name, Buffer.from(body.content), body.contentType);
    res.status(201).json({ data: file });
  };

  const download: RequestHandler = async (req, res) => {
    const user = res.locals.user as User;
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!name) throw new ValidationError("name is required");
    const file = await service.download(user.id, name);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", "attachment");
    res.send(file.content);
  };

  const importFromUrl: RequestHandler = async (req, res) => {
    const user = res.locals.user as User;
    const body = parse(ImportBody, req.body);
    const file = await service.importFromUrl(user.id, body.name, body.url);
    res.status(201).json({ data: file });
  };

  return { list, upload, download, importFromUrl };
}
