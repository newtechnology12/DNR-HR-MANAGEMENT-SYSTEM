
// import React, { useState, useEffect } from 'react';
// import { Card, CardHeader, CardTitle } from '@/components/ui/card';
// import { Save, FileDown, AlertCircle, Edit } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { toast } from 'sonner';
// import pocketbase from '@/lib/pocketbase';

// const LeaveCell = ({ value, onChange, isEditable, className = "" }) => (
//   <input
//     type="number"
//     min="0"
//     value={value || ""}
//     onChange={(e) => onChange(e.target.value)}
//     disabled={!isEditable} // Disable input when not editable
//     className={`w-full h-8 px-2 text-sm border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none text-center disabled:bg-gray-50 disabled:text-gray-500 ${className}`}
//   />
// );

// export default function ExcelStyleLeavePlan() {
//   const [staffData, setStaffData] = useState([]);
//   const [departments, setDepartments] = useState({}); // Store department names
//   const [saving, setSaving] = useState(false);
//   const [editable, setEditable] = useState(false); // Track edit mode
//   const currentYear = new Date().getFullYear();
//   const totalLeaveDaysPerYear = 18; // Default total leave days per year

//   // Fetch all necessary data from PocketBase
//   useEffect(() => {
//     const fetchData = async () => {
//       try {
//         // Fetch departments
//         const departmentRecords = await pocketbase.collection('departments').getFullList();
//         const departmentMap = departmentRecords.reduce((acc, department) => {
//           acc[department.id] = department.name; // Map department ID to name
//           return acc;
//         }, {});
//         setDepartments(departmentMap);

//         // Fetch active users
//         const activeUsers = await pocketbase.collection('users').getFullList({
//           filter: 'status = "Active"',
//         });

//         // Fetch LeavePlaneReport data
//         const leavePlaneReports = await pocketbase.collection('LeavePlaneReport').getFullList();

//         // Format staff data
//         const formattedUsers = activeUsers.map(user => {
//           // Find the user's LeavePlaneReport (if it exists)
//           const userReport = leavePlaneReports.find(report => report.userId === user.id);

//           // Initialize monthly leave data
//           const months = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
//           const monthlyLeaveData = months.reduce((acc, month) => {
//             acc[month] = userReport?.[month] || 0; // Use data from LeavePlaneReport if available
//             return acc;
//           }, {});

//           // Calculate total leave days taken in the current year
//           const totalLeaveTaken = Object.values(monthlyLeaveData).reduce((acc, days) => acc + (Number(days) || 0), 0);

//           // Calculate balance
//           const balance = totalLeaveDaysPerYear - totalLeaveTaken;

//           return {
//             id: user.id,
//             name: user.name,
//             departmentId: user.department, // Store department ID
//             totalLeaveDays: totalLeaveDaysPerYear, // Default total leave days
//             totalLeaveTaken,
//             balance,
//             ...monthlyLeaveData, // Populate monthly leave data
//           };
//         });

//         setStaffData(formattedUsers);
//       } catch (error) {
//         toast.error('Failed to fetch data');
//       }
//     };

//     fetchData();
//   }, []);

//   // Handle cell changes (for requesting leave)
//   const handleCellChange = (staffId, month, value) => {
//     setStaffData(prev => 
//       prev.map(staff => {
//         if (staff.id === staffId) {
//           const requestedDays = parseInt(value) || 0;

//           // Calculate new total leave taken
//           const newMonthlyLeaveData = { ...staff, [month]: requestedDays };
//           const newTotalLeaveTaken = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
//             .reduce((acc, m) => acc + (Number(newMonthlyLeaveData[m]) || 0), 0);

//           // Calculate new balance
//           const newBalance = totalLeaveDaysPerYear - newTotalLeaveTaken;

//           // Prevent over-requesting
//           if (newBalance < 0) {
//             toast.error('Cannot request more than available leave days');
//             return staff; // Return unchanged staff data
//           }

//           return {
//             ...staff,
//             [month]: requestedDays,
//             totalLeaveTaken: newTotalLeaveTaken,
//             balance: newBalance,
//           };
//         }
//         return staff;
//       })
//     );
//   };

//   // Save data to LeavePlaneReport table
//   const handleSave = async () => {
//     setSaving(true);
//     try {
//       await Promise.all(
//         staffData.map(async (staff) => {
//           // Prepare the data to save
//           const dataToSave = {
//             userId: staff.id,
//             totalLeaveDays: staff.totalLeaveDays,
//             totalLeaveTaken: staff.totalLeaveTaken,
//             balance: staff.balance,
//             april: staff.april || 0,
//             may: staff.may || 0,
//             june: staff.june || 0,
//             july: staff.july || 0,
//             august: staff.august || 0,
//             september: staff.september || 0,
//             october: staff.october || 0,
//             november: staff.november || 0,
//             december: staff.december || 0,
//           };

//           // Check if the record already exists
//           const existingRecord = await pocketbase.collection('LeavePlaneReport').getFirstListItem(`userId="${staff.id}"`);

//           if (existingRecord) {
//             // Update the existing record
//             await pocketbase.collection('LeavePlaneReport').update(existingRecord.id, dataToSave);
//           } else {
//             // Create a new record
//             await pocketbase.collection('LeavePlaneReport').create(dataToSave);
//           }
//         })
//       );
//       toast.success('Leave plan saved successfully');
//       setEditable(false); // Disable edit mode after saving
//     } catch (error) {
//       toast.error('Failed to save leave plan');
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <div className="max-w-[95vw] mx-auto">
//       <Card className="shadow-lg">
//         <CardHeader className="bg-white border-b">
//           <div className="flex items-center justify-between">
//             <div>
//               <CardTitle className="text-xl font-bold text-gray-800">
//                 DNR PARTNERS CPA
//               </CardTitle>
//               <p className="text-sm text-gray-600 mt-1">
//                 Annual Staff Leave Plan {currentYear}
//               </p>
//             </div>
//             <div className="flex gap-2">
//               <Button variant="outline" size="sm">
//                 <FileDown className="w-4 h-4 mr-2" />
//                 Export Excel
//               </Button>
//               <Button 
//                 size="sm" 
//                 onClick={() => setEditable(!editable)} // Toggle edit mode
//               >
//                 <Edit className="w-4 h-4 mr-2" />
//                 {editable ? "Cancel Edit" : "Edit"}
//               </Button>
//               <Button 
//                 size="sm" 
//                 onClick={handleSave} 
//                 disabled={saving || !editable} // Disable save button when not in edit mode
//               >
//                 {saving ? (
//                   <>
//                     <span className="animate-spin mr-2">⭘</span>
//                     Saving...
//                   </>
//                 ) : (
//                   <>
//                     <Save className="w-4 h-4 mr-2" />
//                     Save Changes
//                   </>
//                 )}
//               </Button>
//             </div>
//           </div>
//         </CardHeader>

//         <div className="overflow-x-auto">
//           <table className="w-full border-collapse">
//             <thead>
//               <tr className="bg-gray-100">
//                 <th className="border px-4 py-2 text-sm font-semibold text-gray-700 sticky left-0 bg-gray-100">Staff Name</th>
//                 <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Department</th>
//                 <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Total Leave Days</th>
//                 {['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map(month => (
//                   <th key={month} className="border px-4 py-2 text-sm font-semibold text-blue-700">
//                     {month.charAt(0).toUpperCase() + month.slice(1)}-{currentYear}
//                   </th>
//                 ))}
//                 <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Balance</th>
//               </tr>
//             </thead>
//             <tbody>
//               {staffData.map((staff, index) => {
//                 const isFirstRow = index === 0;
//                 const isLastRow = index === staffData.length - 1;
                
//                 return (
//                   <tr 
//                     key={staff.id}
//                     className={`
//                       hover:bg-blue-50/40 
//                       ${isFirstRow ? 'border-t-2 border-t-gray-300' : ''}
//                       ${isLastRow ? 'border-b-2 border-b-gray-300' : ''}
//                     `}
//                   >
//                     <td className="border px-4 py-1 text-sm sticky left-0 bg-white">
//                       {staff.name}
//                     </td>
//                     <td className="border px-4 py-1 text-sm text-center">
//                       {departments[staff.departmentId] || "Unknown Department"}
//                     </td>
//                     <td className="border px-4 py-1 text-sm text-center bg-gray-50">
//                       {staff.totalLeaveDays}
//                     </td>
//                     {['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map(month => (
//                       <td key={month} className="border px-0 py-1">
//                         {editable ? (
//                           <LeaveCell
//                             value={staff[month] || 0}
//                             onChange={(value) => handleCellChange(staff.id, month, value)}
//                             isEditable={editable} // Editable only in edit mode
//                           />
//                         ) : (
//                           <input
//                             type="number"
//                             min="0"
//                             value={staff[month] || 0} // Display real data
//                             disabled
//                             className="w-full h-8 px-2 text-sm border-0 text-center bg-gray-50 text-gray-500"
//                           />
//                         )}
//                       </td>
//                     ))}
//                     <td className="border px-4 py-1 text-sm font-medium text-center bg-gray-50">
//                       {staff.balance}
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>
//         </div>

//         <div className="p-4 bg-gray-50 border-t">
//           <div className="flex items-start gap-3">
//             <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
//             <div className="text-sm text-gray-600">
//               <p className="font-medium text-gray-900 mb-1">Important Notes:</p>
//               <ul className="list-disc ml-4 space-y-1">
//                 <li>Each staff member has a total of 18 leave days per year.</li>
//                 <li>Leave requests cannot exceed the available balance.</li>
//               </ul>
//             </div>
//           </div>
//         </div>
//       </Card>
//     </div>
//   );
// }


import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, FileDown, AlertCircle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import pocketbase from '@/lib/pocketbase';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const LeaveCell = ({ value, onChange, isEditable, className = "" }) => (
  <input
    type="number"
    min="0"
    value={value || ""}
    onChange={(e) => onChange(e.target.value)}
    disabled={!isEditable} // Disable input when not editable
    className={`w-full h-8 px-2 text-sm border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none text-center disabled:bg-gray-50 disabled:text-gray-500 ${className}`}
  />
);

export default function ExcelStyleLeavePlan() {
  const [staffData, setStaffData] = useState([]);
  const [departments, setDepartments] = useState({}); // Store department names
  const [saving, setSaving] = useState(false);
  const [editable, setEditable] = useState(false); // Track edit mode
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [annualLeaveDays, setAnnualLeaveDays] = useState(18); // Default annual leave days
  const currentYear = new Date().getFullYear();
  const totalLeaveDaysPerYear = annualLeaveDays; // Default total leave days per year

  // Fetch all necessary data from PocketBase
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch departments
        const departmentRecords = await pocketbase.collection('departments').getFullList();
        const departmentMap = departmentRecords.reduce((acc, department) => {
          acc[department.id] = department.name; // Map department ID to name
          return acc;
        }, {});
        setDepartments(departmentMap);

        // Fetch active users
        const activeUsers = await pocketbase.collection('users').getFullList({
          filter: 'status = "Active"',
        });

        // Fetch LeavePlaneReport data
        const leavePlaneReports = await pocketbase.collection('LeavePlaneReport').getFullList();

        // Format staff data
        const formattedUsers = activeUsers.map(user => {
          // Find the user's LeavePlaneReport (if it exists)
          const userReport = leavePlaneReports.find(report => report.userId === user.id);

          // Initialize monthly leave data
          const months = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
          const monthlyLeaveData = months.reduce((acc, month) => {
            acc[month] = userReport?.[month] || 0; // Use data from LeavePlaneReport if available
            return acc;
          }, {});

          // Calculate total leave days taken in the current year
          const totalLeaveTaken = Object.values(monthlyLeaveData).reduce((acc, days) => acc + (Number(days) || 0), 0);

          // Calculate balance
          const balance = totalLeaveDaysPerYear - totalLeaveTaken;

          return {
            id: user.id,
            name: user.name,
            departmentId: user.department, // Store department ID
            totalLeaveDays: totalLeaveDaysPerYear, // Default total leave days
            totalLeaveTaken,
            balance,
            ...monthlyLeaveData, // Populate monthly leave data
          };
        });

        setStaffData(formattedUsers);
      } catch (error) {
        toast.error('Failed to fetch data');
      }
    };

    fetchData();
  }, []);

  // Handle cell changes (for requesting leave)
  const handleCellChange = (staffId, month, value) => {
    setStaffData(prev => 
      prev.map(staff => {
        if (staff.id === staffId) {
          const requestedDays = parseInt(value) || 0;

          // Calculate new total leave taken
          const newMonthlyLeaveData = { ...staff, [month]: requestedDays };
          const newTotalLeaveTaken = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
            .reduce((acc, m) => acc + (Number(newMonthlyLeaveData[m]) || 0), 0);

          // Calculate new balance
          const newBalance = totalLeaveDaysPerYear - newTotalLeaveTaken;

          // Prevent over-requesting
          if (newBalance < 0) {
            toast.error('Cannot request more than available leave days');
            return staff; // Return unchanged staff data
          }

          return {
            ...staff,
            [month]: requestedDays,
            totalLeaveTaken: newTotalLeaveTaken,
            balance: newBalance,
          };
        }
        return staff;
      })
    );
  };

  // Save data to LeavePlaneReport table
  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        staffData.map(async (staff) => {
          // Prepare the data to save
          const dataToSave = {
            userId: staff.id,
            totalLeaveDays: staff.totalLeaveDays,
            totalLeaveTaken: staff.totalLeaveTaken,
            openingBalance: staff.totalLeaveDays,
            balance: staff.balance,
            april: staff.april || 0,
            may: staff.may || 0,
            june: staff.june || 0,
            july: staff.july || 0,
            august: staff.august || 0,
            september: staff.september || 0,
            october: staff.october || 0,
            november: staff.november || 0,
            december: staff.december || 0,
          };

          // Check if the record already exists
          const existingRecord = await pocketbase.collection('LeavePlaneReport').getFirstListItem(`userId="${staff.id}"`);

          if (existingRecord) {
            // Update the existing record
            await pocketbase.collection('LeavePlaneReport').update(existingRecord.id, dataToSave);
          } else {
            // Create a new record
            await pocketbase.collection('LeavePlaneReport').create(dataToSave);
          }
        })
      );
      toast.success('Leave plan saved successfully');
      setEditable(false); // Disable edit mode after saving
    } catch (error) {
      toast.error('Failed to save leave plan');
    } finally {
      setSaving(false);
    }
  };

  const calculateLeaveDays = () => {
    if (startDate && endDate) {
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    }
    
    return 0;
  };
  console.log("calculateLeaveDays" ,calculateLeaveDays());

  return (
    <div className="max-w-[95vw] mx-auto">
      <Card className="shadow-lg">
        <CardHeader className="bg-white border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-gray-800">
                DNR PARTNERS CPA
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Annual Staff Leave Plan {currentYear}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <FileDown className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Button 
                size="sm" 
                onClick={() => setEditable(!editable)} // Toggle edit mode
              >
                <Edit className="w-4 h-4 mr-2" />
                {editable ? "Cancel Edit" : "Edit"}
              </Button>
              <Button 
                size="sm" 
                onClick={handleSave} 
                disabled={saving || !editable} // Disable save button when not in edit mode
              >
                {saving ? (
                  <>
                    <span className="animate-spin mr-2">⭘</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700 sticky left-0 bg-gray-100">Staff Name</th>
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Department</th>
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Opening Balance</th>
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Total Leave Days</th>
                {['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map(month => (
                  <th key={month} className="border px-4 py-2 text-sm font-semibold text-blue-700">
                    {month.charAt(0).toUpperCase() + month.slice(1)}-{currentYear}
                  </th>
                ))}
                <th className="border px-4 py-2 text-sm font-semibold text-gray-700">Balance</th>
              </tr>
            </thead>
            <tbody>
              {staffData.map((staff, index) => {
                const isFirstRow = index === 0;
                const isLastRow = index === staffData.length - 1;
                
                return (
                  <tr 
                    key={staff.id}
                    className={`
                      hover:bg-blue-50/40 
                      ${isFirstRow ? 'border-t-2 border-t-gray-300' : ''}
                      ${isLastRow ? 'border-b-2 border-b-gray-300' : ''}
                    `}
                  >
                    <td className="border px-4 py-1 text-sm sticky left-0 bg-white">
                      {staff.name}
                    </td>
                    <td className="border px-4 py-1 text-sm text-center">
                      {departments[staff.departmentId] || "Unknown Department"}
                    </td>
                    <td className="border px-4 py-1 text-sm text-center bg-gray-50">
                      {staff.openingBalance}
                    </td>
                   
                    <td className="border px-4 py-1 text-sm text-center bg-gray-50">
                      {staff.totalLeaveDays}
                    </td>
                    {['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map(month => (
                      <td key={month} className="border px-0 py-1">
                        {editable ? (
                          <LeaveCell
                            value={staff[month] || 0}
                            onChange={(value) => handleCellChange(staff.id, month, value)}
                            isEditable={editable} // Editable only in edit mode
                          />
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={staff[month] || 0} // Display real data
                            disabled
                            className="w-full h-8 px-2 text-sm border-0 text-center bg-gray-50 text-gray-500"
                          />
                        )}
                      </td>
                    ))}
                    <td className="border px-4 py-1 text-sm font-medium text-center bg-gray-50">
                      {staff.balance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-gray-50 border-t">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-900 mb-1">Important Notes:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Each staff member has a total of {annualLeaveDays} leave days per year.</li>
                <li>Leave requests cannot exceed the available balance.</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}