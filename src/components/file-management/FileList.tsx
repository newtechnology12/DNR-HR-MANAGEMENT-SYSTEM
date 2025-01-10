import React, { useState } from "react";
import { FileMetadata, Department, Folder } from "../../types";
import {
  File,
  Archive,
  Trash2,
  Search,
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  Plus,
} from "lucide-react";
import { fileStore } from "../../lib/store";
import { toast } from "sonner";

interface FileListProps {
  files: FileMetadata[];
  department: Department;
  onUpdate: () => void;
}

export function FileList({ files, department, onUpdate }: FileListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["root"])
  );
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [draggedOver, setDraggedOver] = useState<string | null>(null);

  const folders = fileStore
    .getFolders()
    .filter((f) => f.department === department);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error("Please enter a folder name");
      return;
    }

    const newFolder: Folder = {
      id: Math.random().toString(36).substring(7),
      name: newFolderName.trim(),
      department,
      parentId: null,
      createdAt: new Date().toISOString(),
    };

    fileStore.addFolder(newFolder);
    setNewFolderName("");
    setShowNewFolderInput(false);
    toast.success("Folder created");
  };

  const handleDeleteFolder = (folderId: string) => {
    if (confirm("Are you sure? Files will be moved to root.")) {
      fileStore.deleteFolder(folderId);
      toast.success("Folder deleted");
    }
  };

  const handleArchive = async (fileId: string) => {
    try {
      fileStore.updateFile(fileId, { archived: true });
      toast.success("File archived");
      onUpdate();
    } catch (error) {
      console.error("Archive error:", error);
      toast.error("Failed to archive file");
    }
  };

  const handleDelete = async (fileId: string, filePath: string) => {
    try {
      URL.revokeObjectURL(filePath);
      fileStore.deleteFile(fileId);
      toast.success("File deleted");
      onUpdate();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete file");
    }
  };

  const handleDragStart = (fileId: string) => {
    setDraggedFile(fileId);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDraggedOver(folderId);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    if (draggedFile) {
      fileStore.moveFile(draggedFile, targetFolderId);
      toast.success("File moved successfully");
      setDraggedFile(null);
      setDraggedOver(null);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderFolderContents = (folderId: string | null) => {
    const folderFiles = files.filter((f) => f.folderId === folderId);
    const subfolders = folders.filter((f) => f.parentId === folderId);

    if (folderFiles.length === 0 && subfolders.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p>No files or folders yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {subfolders.map((folder) => (
          <div
            key={folder.id}
            className={`${draggedOver === folder.id ? "bg-blue-50" : ""}`}
            onDragOver={(e) => handleDragOver(e, folder.id)}
            onDrop={(e) => handleDrop(e, folder.id)}
          >
            <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group">
              <button
                onClick={() => toggleFolder(folder.id)}
                className="flex items-center flex-1"
              >
                {expandedFolders.has(folder.id) ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 mr-2" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 mr-2" />
                )}
                <FolderIcon className="h-5 w-5 text-blue-500 mr-2" />
                <span className="text-sm font-medium">{folder.name}</span>
              </button>
              <button
                onClick={() => handleDeleteFolder(folder.id)}
                className="p-1 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {expandedFolders.has(folder.id) && (
              <div className="ml-6">{renderFolderContents(folder.id)}</div>
            )}
          </div>
        ))}

        {folderFiles.map((file) => (
          <div
            key={file.id}
            className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group"
            draggable
            onDragStart={() => handleDragStart(file.id)}
          >
            <div className="flex items-center space-x-3">
              <File className="text-gray-400 h-5 w-5" />
              <div>
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {new Date(file.uploadedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex space-x-2 opacity-0 group-hover:opacity-100">
              {!file.archived && (
                <button
                  onClick={() => handleArchive(file.id)}
                  className="p-1 text-gray-500 hover:text-yellow-500"
                >
                  <Archive size={16} />
                </button>
              )}
              <button
                onClick={() => handleDelete(file.id, file.path)}
                className="p-1 text-gray-500 hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            className="pl-10 w-full p-2 border rounded-lg"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={() => setShowNewFolderInput(true)}
            className="flex items-center text-sm text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Folder
          </button>
        </div>

        {showNewFolderInput && (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Folder name"
              className="flex-1 p-2 border rounded-lg text-sm"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewFolderInput(false);
                setNewFolderName("");
              }}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div
        className={`space-y-2 ${draggedOver === null ? "bg-blue-50" : ""}`}
        onDragOver={(e) => handleDragOver(e, null)}
        onDrop={(e) => handleDrop(e, null)}
      >
        {renderFolderContents(null)}
      </div>
    </div>
  );
}
