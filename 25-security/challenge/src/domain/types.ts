export interface User {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  settings: Record<string, unknown>;
}

export interface FileRecord {
  id: number;
  ownerId: number;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
}
