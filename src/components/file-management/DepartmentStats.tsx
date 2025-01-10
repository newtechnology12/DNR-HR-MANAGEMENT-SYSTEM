import React from "react";
import { FileMetadata, Department } from "../../types";
import { BarChart, HardDrive, FileType } from "lucide-react";

interface DepartmentStatsProps {
  files: FileMetadata[];
  selectedDepartment: Department;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export function DepartmentStats({
  files,
  selectedDepartment,
}: DepartmentStatsProps) {
  const departmentFiles = files.filter(
    (file) => file.department === selectedDepartment
  );

  // Calculate statistics
  const totalSize = departmentFiles.reduce((acc, file) => acc + file.size, 0);
  const activeCount = departmentFiles.filter((f) => !f.archived).length;
  const archivedCount = departmentFiles.filter((f) => f.archived).length;

  // Group files by type
  const fileTypes = departmentFiles.reduce((acc, file) => {
    const type = file.type.split("/")[1] || file.type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center mb-4">
          <BarChart className="text-blue-500 mr-2" />
          <h2 className="text-xl font-semibold">
            {selectedDepartment} Statistics
          </h2>
        </div>

        <div className="space-y-4">
          <div className="border-b pb-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-gray-500">Active Files</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{archivedCount}</p>
                <p className="text-sm text-gray-500">Archived Files</p>
              </div>
            </div>
          </div>

          <div className="border-b pb-4">
            <div className="flex items-center mb-2">
              <HardDrive className="h-4 w-4 text-gray-500 mr-1" />
              <h3 className="text-sm font-medium text-gray-500">
                Storage Used
              </h3>
            </div>
            <p className="text-2xl font-bold">{formatBytes(totalSize)}</p>
          </div>

          <div>
            <div className="flex items-center mb-2">
              <FileType className="h-4 w-4 text-gray-500 mr-1" />
              <h3 className="text-sm font-medium text-gray-500">File Types</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(fileTypes).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">.{type}</span>
                  <span className="text-sm font-medium">{count} files</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
