import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { Department } from "../../types";
import { fileStore } from "../../lib/store";
import { toast } from "sonner";

interface FileUploadProps {
  department: Department;
  onUploadComplete: () => void;
  currentFolder?: string | null;
}

export function FileUpload({
  department,
  onUploadComplete,
  currentFolder = null,
}: FileUploadProps) {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        try {
          // Simulate file upload by creating a blob URL
          const blobUrl = URL.createObjectURL(file);

          fileStore.addFile({
            id: Math.random().toString(36).substring(7),
            name: file.name,
            size: file.size,
            type: file.type,
            department,
            uploadedBy: "current-user",
            uploadedAt: new Date().toISOString(),
            archived: false,
            path: blobUrl,
            folderId: currentFolder,
          });

          toast.success(`Uploaded ${file.name}`);
          onUploadComplete();
        } catch (error) {
          console.error("Upload error:", error);
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    },
    [department, onUploadComplete, currentFolder]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div
      {...getRootProps()}
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
    >
      <input {...getInputProps()} />
      <Upload className="mx-auto h-12 w-12 text-gray-400" />
      <p className="mt-2 text-sm text-gray-600">
        {isDragActive
          ? "Drop the files here..."
          : "Drag 'n' drop files here, or click to select files"}
      </p>
      {currentFolder && (
        <p className="mt-1 text-xs text-gray-500">
          Files will be uploaded to the current folder
        </p>
      )}
    </div>
  );
}
