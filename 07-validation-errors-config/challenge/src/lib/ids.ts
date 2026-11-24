import { randomUUID } from "node:crypto";

export type IdGenerator = (prefix: string) => string;

export const randomId: IdGenerator = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;
