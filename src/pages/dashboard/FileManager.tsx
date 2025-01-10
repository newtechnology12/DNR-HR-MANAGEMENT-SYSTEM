import { useEffect, useState } from "react";
import { FileUpload } from "@/components/file-management/FileUpload";
import { FileList } from "@/components/file-management/FileList";
import { DepartmentStats } from "@/components/file-management/DepartmentStats";
import { DepartmentNav } from "@/components/file-management/DepartmentNav";
import { FileMetadata, Department } from "../../types";
import { fileStore } from "../../lib/store";
import { FolderOpen } from "lucide-react";
import BreadCrumb from "@/components/breadcrumb";

function FileManager() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [selectedDepartment, setSelectedDepartment] =
    useState<Department>("HR");

  useEffect(() => {
    const unsubscribe = fileStore.subscribe(() => {
      setFiles(fileStore.getFiles());
    });
    setFiles(fileStore.getFiles());
    return () => unsubscribe();
  }, []);

  const departmentFiles = files.filter(
    (f) => f.department === selectedDepartment
  );
  const activeFiles = departmentFiles.filter((f) => !f.archived);
  const archivedFiles = departmentFiles.filter((f) => f.archived);

  return (
    <div className="px-3">
      <div className="flex items-start justify-between space-y-2">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            All Designations
          </h2>
          <BreadCrumb
            items={[{ title: "View Designations", link: "/dashboard" }]}
          />
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-4">
        <div className="grid grid-cols-12 gap-8">
          {/* Left Sidebar */}
          <div className="col-span-3">
            <DepartmentNav
              selectedDepartment={selectedDepartment}
              onSelectDepartment={setSelectedDepartment}
            />
          </div>

          {/* Main Content */}
          <div className="col-span-6 space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Upload Files</h2>
                <span className="text-sm text-gray-500">
                  to {selectedDepartment} Department
                </span>
              </div>
              <FileUpload
                department={selectedDepartment}
                onUploadComplete={() => {}}
              />
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Active Files</h2>
              <FileList
                files={activeFiles}
                department={selectedDepartment}
                onUpdate={() => {}}
              />
            </div>

            {archivedFiles.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4">Archived Files</h2>
                <FileList
                  files={archivedFiles}
                  department={selectedDepartment}
                  onUpdate={() => {}}
                />
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="col-span-3">
            <DepartmentStats
              files={files}
              selectedDepartment={selectedDepartment}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default FileManager;
