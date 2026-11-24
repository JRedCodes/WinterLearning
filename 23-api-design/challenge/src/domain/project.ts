export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string; // ISO 8601
}

export interface NewProject {
  name: string;
  description: string;
}
