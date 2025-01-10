import React from "react";
import { Department } from "../../types";
import {
  Folder,
  FolderOpen,
  Users,
  Briefcase,
  Megaphone,
  Monitor,
  Settings,
} from "lucide-react";

interface DepartmentNavProps {
  selectedDepartment: Department;
  onSelectDepartment: (department: Department) => void;
}

const departmentIcons = {
  HR: Users,
  Finance: Briefcase,
  Marketing: Megaphone,
  IT: Monitor,
  Operations: Settings,
};

export function DepartmentNav({
  selectedDepartment,
  onSelectDepartment,
}: DepartmentNavProps) {
  const departments: Department[] = [
    "HR",
    "Finance",
    "Marketing",
    "IT",
    "Operations",
  ];

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-4 px-2">Departments</h2>
      <nav>
        {departments.map((dept) => {
          const Icon = departmentIcons[dept];
          const isSelected = dept === selectedDepartment;

          return (
            <button
              key={dept}
              onClick={() => onSelectDepartment(dept)}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center space-x-3 transition-colors ${
                isSelected
                  ? "bg-blue-50 text-blue-600"
                  : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              {isSelected ? (
                <FolderOpen className="h-5 w-5" />
              ) : (
                <Folder className="h-5 w-5" />
              )}
              <span>{dept}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
