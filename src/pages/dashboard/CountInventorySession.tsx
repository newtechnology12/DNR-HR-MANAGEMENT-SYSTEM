import { useState, useEffect, useCallback } from 'react';
import { Save, AlertCircle, Edit, Loader2, Building, Users, Calendar, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import pocketbase from '@/lib/pocketbase';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const MONTHS = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const MONTH_LABELS = {
  april: 'April', may: 'May', june: 'June', july: 'July',
  august: 'August', september: 'September', october: 'October',
  november: 'November', december: 'December'
};

const LeaveCell = ({ value, onChange, isEditable, hasError }) => (
  <input
    type="number"
    min="0"
    max="31"
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
    disabled={!isEditable}
    className={`w-full h-9 px-1 text-sm border-0 focus:ring-2 focus:ring-primary/40 focus:outline-none text-center transition-colors
      ${isEditable
        ? 'bg-ims-card hover:bg-ims-info-bg focus:bg-ims-card'
        : 'bg-ims-thead/70 text-ims-muted cursor-not-allowed'
      }
      ${hasError ? 'bg-ims-danger-bg text-ims-danger' : ''}
    `}
  />
);

export default function ExcelStyleLeavePlan() {
  const [staffData, setStaffData] = useState([]);
  const [departmentMap, setDepartmentMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editable, setEditable] = useState(false);
  const [annualLeaveDays, setAnnualLeaveDays] = useState(18);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [departmentRecords, activeUsers, leavePlaneReports, settingsRecords] = await Promise.all([
          pocketbase.collection('departments').getFullList(),
          pocketbase.collection('users').getFullList({ filter: 'status = "Active"' }),
          pocketbase.collection('LeavePlaneReport').getFullList(),
          pocketbase.collection('settings').getList(1, 1)
        ]);

        const dMap = departmentRecords.reduce((acc, d) => {
          acc[d.id] = d.name;
          return acc;
        }, {});
        setDepartmentMap(dMap);

        if (settingsRecords?.items?.[0]?.leaves_per_year) {
          setAnnualLeaveDays(settingsRecords.items[0].leaves_per_year);
        }

        const formattedUsers = activeUsers.map(user => {
          const userReport = leavePlaneReports.find(report => report.userId === user.id);
          const monthlyLeaveData = MONTHS.reduce((acc, month) => {
            acc[month] = userReport?.[month] || 0;
            return acc;
          }, {});
          const totalLeaveTaken = MONTHS.reduce((acc, m) => acc + (Number(monthlyLeaveData[m]) || 0), 0);
          const openingBalance = userReport?.openingBalance ?? annualLeaveDays;

          return {
            id: user.id,
            name: user.name,
            departmentId: user.department,
            openingBalance,
            totalLeaveDays: annualLeaveDays,
            totalLeaveTaken,
            balance: openingBalance - totalLeaveTaken,
            ...monthlyLeaveData,
          };
        });

        setStaffData(formattedUsers);
      } catch (error) {
        toast.error('Failed to load leave plan data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCellChange = useCallback((staffId, month, value) => {
    setStaffData(prev =>
      prev.map(staff => {
        if (staff.id !== staffId) return staff;
        const requestedDays = Number(value) || 0;
        const newMonthlyData = { ...staff, [month]: requestedDays };
        const newTotalTaken = MONTHS.reduce((acc, m) => acc + (Number(newMonthlyData[m]) || 0), 0);
        const newBalance = staff.openingBalance - newTotalTaken;

        if (newBalance < 0) {
          toast.error(`${staff.name}: Cannot exceed available balance`);
          return staff;
        }

        return {
          ...staff,
          [month]: requestedDays,
          totalLeaveTaken: newTotalTaken,
          balance: newBalance,
        };
      })
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        staffData.map(async (staff) => {
          const dataToSave = {
            userId: staff.id,
            totalLeaveDays: staff.totalLeaveDays,
            totalLeaveTaken: staff.totalLeaveTaken,
            openingBalance: staff.openingBalance,
            balance: staff.balance,
            ...MONTHS.reduce((acc, m) => ({ ...acc, [m]: staff[m] || 0 }), {}),
          };

          try {
            const existingRecord = await pocketbase.collection('LeavePlaneReport').getFirstListItem(`userId="${staff.id}"`);
            await pocketbase.collection('LeavePlaneReport').update(existingRecord.id, dataToSave);
          } catch {
            await pocketbase.collection('LeavePlaneReport').create(dataToSave);
          }
        })
      );
      toast.success('Leave plan saved successfully');
      setEditable(false);
    } catch (error) {
      toast.error('Failed to save leave plan');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = () => {
    try {
      const excelData: Record<string, any>[] = staffData.map((staff, idx) => {
        const row = {
          '#': idx + 1,
          'Staff Name': staff.name,
          'Department': departmentMap[staff.departmentId] || 'N/A',
          'Opening Balance': staff.openingBalance,
          'Total Leave Days': staff.totalLeaveDays,
          ...MONTHS.reduce((acc, m) => ({
            ...acc,
            [`${MONTH_LABELS[m]}-${currentYear}`]: staff[m] || 0
          }), {}),
          'Balance': staff.balance,
        };
        return row;
      });

      const totals: Record<string, any> = {
        '#': '',
        'Staff Name': 'TOTAL',
        'Department': '',
        'Opening Balance': staffData.reduce((s, st) => s + st.openingBalance, 0),
        'Total Leave Days': staffData.reduce((s, st) => s + st.totalLeaveDays, 0),
        ...MONTHS.reduce((acc, m) => ({
          ...acc,
          [`${MONTH_LABELS[m]}-${currentYear}`]: staffData.reduce((s, st) => s + (Number(st[m]) || 0), 0)
        }), {}),
        'Balance': staffData.reduce((s, st) => s + st.balance, 0),
      };
      excelData.push(totals);

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wscols = [
        { wch: 4 }, { wch: 30 }, { wch: 20 },
        { wch: 16 }, { wch: 16 },
        ...MONTHS.map(() => ({ wch: 16 })),
        { wch: 12 },
      ];
      ws['!cols'] = wscols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leave Plan');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `Annual_Leave_Plan_${currentYear}.xlsx`);
      toast.success('Excel file exported successfully');
    } catch (error) {
      toast.error('Failed to export Excel');
    }
  };

  const totalOpeningBalance = staffData.reduce((s, st) => s + st.openingBalance, 0);
  const totalLeaveDays = staffData.reduce((s, st) => s + st.totalLeaveDays, 0);
  const totalBalance = staffData.reduce((s, st) => s + st.balance, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-sm text-ims-muted">Loading leave plan data...</span>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4 max-w-[98vw] mx-auto">
      <div className="rounded-control border border-ims-border bg-ims-card shadow-sm overflow-hidden">
        <div className="border-b border-ims-border bg-gradient-to-r from-slate-50 to-white">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-control bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-ims-text">
                    DNR PARTNERS CPA
                  </h1>
                  <p className="text-sm text-ims-muted mt-1 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Annual Staff Leave Plan {currentYear}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-ims-success" />
                  Export Excel
                </Button>
                <Button
                  size="sm"
                  onClick={() => setEditable(!editable)}
                  variant={editable ? "destructive" : "default"}
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  {editable ? "Cancel Edit" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !editable}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-ims-subtle border-r border-b border-ims-border px-4 py-3 text-left text-xs font-semibold text-ims-body min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Staff Name
                  </div>
                </th>
                <th className="bg-ims-subtle border-r border-b border-ims-border px-3 py-3 text-left text-xs font-semibold text-ims-body min-w-[140px]">
                  Department
                </th>
                <th className="bg-ims-subtle border-r border-b border-ims-border px-3 py-3 text-center text-xs font-semibold text-ims-body min-w-[100px]">
                  Opening
                  <br />Balance
                </th>
                <th className="bg-ims-subtle border-r border-b border-ims-border px-3 py-3 text-center text-xs font-semibold text-ims-body min-w-[90px]">
                  Total
                  <br />Leave Days
                </th>
                {MONTHS.map(month => (
                  <th key={month} className="bg-ims-subtle border-r border-b border-ims-border px-2 py-3 text-center text-xs font-semibold text-primary min-w-[100px]">
                    {MONTH_LABELS[month]}
                    <br />
                    <span className="text-t-hint font-normal text-ims-faint">{currentYear}</span>
                  </th>
                ))}
                <th className="bg-ims-subtle border-b border-ims-border px-3 py-3 text-center text-xs font-semibold text-ims-body min-w-[80px]">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {staffData.map((staff, index) => (
                <tr
                  key={staff.id}
                  className={`transition-colors hover:bg-ims-info-bg ${index % 2 === 0 ? 'bg-ims-card' : 'bg-ims-thead/40'}`}
                >
                  <td className="sticky left-0 z-10 bg-inherit border-r border-b border-ims-divider px-4 py-2.5">
                    <span className="text-sm font-medium text-ims-text">{staff.name}</span>
                  </td>
                  <td className="border-r border-b border-ims-divider px-3 py-2.5">
                    <span className="text-sm text-ims-body">{departmentMap[staff.departmentId] || "N/A"}</span>
                  </td>
                  <td className="border-r border-b border-ims-divider px-3 py-2.5 text-center">
                    <span className="text-sm font-semibold text-ims-body">{staff.openingBalance}</span>
                  </td>
                  <td className="border-r border-b border-ims-divider px-3 py-2.5 text-center">
                    <span className="text-sm font-semibold text-ims-body">{staff.totalLeaveDays}</span>
                  </td>
                  {MONTHS.map(month => (
                    <td key={month} className="border-r border-b border-ims-divider p-0">
                      <LeaveCell
                        value={staff[month]}
                        onChange={(value) => handleCellChange(staff.id, month, value)}
                        isEditable={editable}
                        hasError={false}
                      />
                    </td>
                  ))}
                  <td className="border-b border-ims-divider px-3 py-2.5 text-center">
                    <span className={`text-sm font-bold ${staff.balance < 3 ? 'text-ims-danger' : staff.balance < 6 ? 'text-ims-warning' : 'text-ims-success'}`}>
                      {staff.balance}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ims-subtle/80">
                <td className="sticky left-0 z-10 bg-ims-subtle/80 border-r border-t border-ims-border px-4 py-3">
                  <span className="text-sm font-bold text-ims-text">TOTAL</span>
                  <span className="text-xs text-ims-muted ml-2">({staffData.length} employees)</span>
                </td>
                <td className="border-r border-t border-ims-border px-3 py-3 text-center text-sm font-bold text-ims-body">
                  -
                </td>
                <td className="border-r border-t border-ims-border px-3 py-3 text-center text-sm font-bold text-ims-body">
                  {totalOpeningBalance}
                </td>
                <td className="border-r border-t border-ims-border px-3 py-3 text-center text-sm font-bold text-ims-body">
                  {totalLeaveDays}
                </td>
                {MONTHS.map(month => (
                  <td key={month} className="border-r border-t border-ims-border px-2 py-3 text-center text-sm font-bold text-primary">
                    {staffData.reduce((s, st) => s + (Number(st[month]) || 0), 0)}
                  </td>
                ))}
                <td className="border-t border-ims-border px-3 py-3 text-center">
                  <span className={`text-sm font-bold ${totalBalance < 10 ? 'text-ims-danger' : totalBalance < 30 ? 'text-ims-warning' : 'text-ims-success'}`}>
                    {totalBalance}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="border-t border-ims-border bg-ims-warning-bg">
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-ims-warning-bg flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertCircle className="h-4 w-4 text-ims-warning" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ims-text mb-2">Important Notes</h4>
                <ul className="space-y-1.5 text-sm text-ims-body">
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    Each staff member has a total of <strong className="text-ims-text">{annualLeaveDays}</strong> leave days per year.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    Leave requests cannot exceed the available balance.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    The leave year runs from <strong className="text-ims-text">April 1st</strong> to <strong className="text-ims-text">December 31st</strong>.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    Any unused leave days do not carry over to the next year unless approved by management.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
