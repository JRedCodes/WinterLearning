import type { Actor } from "../domain/actor.js";
import type { Document, DocumentPatch, NewDocument } from "../domain/document.js";
import type { DocumentRepository } from "../repositories/documentRepository.js";

/**
 * Authorization lives HERE, next to the use cases, not in the routes and not in
 * the repository. Every method receives the Actor doing the work.
 *
 * TODO(6): implement the policy:
 *
 *   action  | owner | admin (not owner)         | other user
 *   --------+-------+---------------------------+--------------------------
 *   list    | own   | ALL documents             | own
 *   get     | yes   | yes                       | NotFoundError("Document")
 *   update  | yes   | ForbiddenError            | NotFoundError("Document")
 *   delete  | yes   | yes                       | NotFoundError("Document")
 *
 * Why 404 and not 403 for other users? A 403 confirms the id exists, which
 * leaks information (an attacker can probe ids). The admin already may know
 * the document exists, so a 403 is honest and helpful there.
 *
 * A missing document is NotFoundError("Document") for everybody.
 */
export class DocumentService {
  constructor(private readonly documents: DocumentRepository) {}

  async create(actor: Actor, input: NewDocument): Promise<Document> {
    return this.documents.create(actor.id, input);
  }

  async list(_actor: Actor): Promise<Document[]> {
    throw new Error("Not implemented: TODO(6) DocumentService.list");
  }

  async get(_actor: Actor, _id: string): Promise<Document> {
    throw new Error("Not implemented: TODO(6) DocumentService.get");
  }

  async update(_actor: Actor, _id: string, _patch: DocumentPatch): Promise<Document> {
    throw new Error("Not implemented: TODO(6) DocumentService.update");
  }

  async remove(_actor: Actor, _id: string): Promise<void> {
    throw new Error("Not implemented: TODO(6) DocumentService.remove");
  }
}
