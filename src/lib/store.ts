import { FileMetadata, Folder } from "../types";

class FileStore {
  private files: FileMetadata[] = [];
  private folders: Folder[] = [];
  private listeners: (() => void)[] = [];

  addFile(file: FileMetadata) {
    this.files.push(file);
    this.notifyListeners();
  }

  getFiles() {
    return [...this.files];
  }

  getFolders() {
    return [...this.folders];
  }

  addFolder(folder: Folder) {
    this.folders.push(folder);
    this.notifyListeners();
  }

  updateFolder(id: string, updates: Partial<Folder>) {
    const index = this.folders.findIndex((f) => f.id === id);
    if (index !== -1) {
      this.folders[index] = { ...this.folders[index], ...updates };
      this.notifyListeners();
    }
  }

  deleteFolder(id: string) {
    // Move files from deleted folder to root
    this.files = this.files.map((file) =>
      file.folderId === id ? { ...file, folderId: null } : file
    );

    // Delete folder and all subfolders
    const folderIdsToDelete = this.getAllSubfolderIds(id);
    folderIdsToDelete.push(id);
    this.folders = this.folders.filter(
      (f) => !folderIdsToDelete.includes(f.id)
    );

    this.notifyListeners();
  }

  private getAllSubfolderIds(folderId: string): string[] {
    const subfolderIds: string[] = [];
    const subfolders = this.folders.filter((f) => f.parentId === folderId);

    subfolders.forEach((folder) => {
      subfolderIds.push(folder.id);
      subfolderIds.push(...this.getAllSubfolderIds(folder.id));
    });

    return subfolderIds;
  }

  updateFile(id: string, updates: Partial<FileMetadata>) {
    const index = this.files.findIndex((f) => f.id === id);
    if (index !== -1) {
      this.files[index] = { ...this.files[index], ...updates };
      this.notifyListeners();
    }
  }

  moveFile(fileId: string, targetFolderId: string | null) {
    const file = this.files.find((f) => f.id === fileId);
    if (file) {
      file.folderId = targetFolderId;
      this.notifyListeners();
    }
  }

  deleteFile(id: string) {
    this.files = this.files.filter((f) => f.id !== id);
    this.notifyListeners();
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }
}

export const fileStore = new FileStore();
