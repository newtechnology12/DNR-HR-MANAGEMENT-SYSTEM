export type Department = "HR" | "Finance" | "Marketing" | "IT" | "Operations";

export type UserRole = "admin" | "manager" | "user";

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  department: Department;
  uploadedBy: string;
  uploadedAt: string;
  archived: boolean;
  path: string;
  folderId: string | null; // New field for folder organization
}

export interface Folder {
  id: string;
  name: string;
  department: Department;
  parentId: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  department: Department;
}
