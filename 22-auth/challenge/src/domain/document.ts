export interface Document {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewDocument {
  title: string;
  body: string;
}

export type DocumentPatch = Partial<NewDocument>;
