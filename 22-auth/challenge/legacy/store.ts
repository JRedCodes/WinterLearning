import { randomUUID } from "node:crypto";

export interface LegacyUser {
  id: string;
  email: string;
  passwordHash: string;
}

export interface LegacyDocument {
  id: string;
  ownerId: string;
  title: string;
  body: string;
}

export class LegacyStore {
  readonly users = new Map<string, LegacyUser>();
  readonly documents = new Map<string, LegacyDocument>();

  addUser(email: string, passwordHash: string): LegacyUser {
    const user = { id: randomUUID(), email: email.trim().toLowerCase(), passwordHash };
    this.users.set(user.id, user);
    return user;
  }

  findUserByEmail(email: string): LegacyUser | undefined {
    const normalized = email.trim().toLowerCase();
    for (const u of this.users.values()) if (u.email === normalized) return u;
    return undefined;
  }

  addDocument(ownerId: string, title: string, body: string): LegacyDocument {
    const doc = { id: randomUUID(), ownerId, title, body };
    this.documents.set(doc.id, doc);
    return doc;
  }
}
