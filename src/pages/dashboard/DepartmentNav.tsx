import React from "react";
import { Department } from "../../types";

interface DepartmentNavProps {
  departments: Department[];
  selectedDepartment: Department;
  onSelectDepartment: (department: Department) => void;
}

const DepartmentNav: React.FC<DepartmentNavProps> = ({
  departments,
  selectedDepartment,
  onSelectDepartment,
}) => {
  return (
    <div>
      <h3 className="text-lg font-semibold">Departments</h3>
      <ul>
        {departments.map((department) => (
          <li
            key={department.id}
            className={`cursor-pointer ${selectedDepartment === department ? "font-bold" : ""}`}
            onClick={() => onSelectDepartment(department)}
          >
            {department.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DepartmentNav;