import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircleIcon, Trash, UploadCloud } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import AsyncSelectField from "../AsyncSelectField";
import cleanObject from "@/utils/cleanObject";
import pocketbase from "@/lib/pocketbase";
import { Button } from "../ui/button";
import { read, utils } from "xlsx";
import Loader from "../icons/Loader";
import { Alert, AlertTitle } from "@/components/ui/alert";
import useSettings from "@/hooks/useSettings";

// Example validation functions
const staffIdExists = async (staffId) => {
  const employee = await pocketbase.collection("users").getOne(staffId);
  return employee;
};

const isValidDateFormat = (date) => {
  const timestamp = Date.parse(date);
  console.log(timestamp, "timestamp");

  // Check if parsing was successful and the result is not NaN
  return !isNaN(timestamp);
};

const isFutureDate = (date) => {
  console.log(date);
  return new Date(date) > new Date();
};

const isValidTimeFormat = (time) => {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time);
};

function timeStringToDate(timeString, date) {
  var parts = timeString.split(":");
  var hours = parseInt(parts[0], 10);
  var minutes = parseInt(parts[1], 10);

  var currentDate = new Date(date);
  currentDate.setHours(hours);
  currentDate.setMinutes(minutes);
  currentDate.setSeconds(0);
  currentDate.setMilliseconds(0);

  return currentDate;
}

const hasOverlap = async (employee, date) => {
  let beginTime: any = new Date(date);
  beginTime.setHours(0, 0, 0, 0);
  beginTime = beginTime.toISOString().replace("T", " ");

  let stopTime: any = new Date(date);
  stopTime.setHours(23, 59, 59, 999);
  stopTime = stopTime.toISOString().replace("T", " ");

  const dateQ = `date >= "${beginTime}" && date < "${stopTime}"`;

  const data = await pocketbase.collection("attendance").getFullList({
    filter: `employee="${employee}" && ${dateQ}`,
  });

  return data[0] ? true : false;
};

const validateAttendanceData = async (rows) => {
  const errors = [];

  // Validation for each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    console.log(row);
    const { employee, date, clockin_time, clockout_time, branch } = row;

    // Clock-in and Clock-out validation
    const times_are_valid =
      isValidTimeFormat(clockin_time) && isValidTimeFormat(clockout_time);
    if (!times_are_valid) {
      errors.push(
        `Row ${
          i + 1
        }: Invalid clockin/clockout times format ${clockin_time} - ${clockout_time}.`
      );
    }

    const date_is_valid = isValidDateFormat(date);
    // Date validation
    if (!date_is_valid) {
      errors.push(`Row ${i + 1}: Invalid date format "${date}".`);
    }

    const futureDate = isFutureDate(date);
    if (futureDate) {
      errors.push(`Row ${i + 1}: Date "${date}" cannot be in the future.`);
    }

    if (
      times_are_valid &&
      date_is_valid &&
      convertTimeStringToDate(new Date(date), clockin_time) >
        convertTimeStringToDate(new Date(date), clockout_time)
    ) {
      errors.push(
        `Row ${i + 1}: Clock-in time must be earlier than clock-out time.`
      );
    }

    const staffExists = await staffIdExists(employee)
      .then((e) => e)
      .catch((e) => {
        console.log(e);
      });

    if (!staffExists) {
      errors.push(`Row ${i + 1}: Invalid staff ID "${employee}".`);
    }

    if (staffExists && staffExists.branch !== branch) {
      errors.push(`Row ${i + 1}: Staff is not in the selected branch.`);
    }

    console.log(date_is_valid && !futureDate);
    const overlaps =
      date_is_valid &&
      !futureDate &&
      staffExists["branch"] === branch &&
      (await hasOverlap(employee, date));
    if (overlaps) {
      errors.push(
        `Row ${i + 1}: Attendance record overlaps with existing record.`
      );
    }
  }

  return errors;
};

function convertTimeStringToDate(date, timeString) {
  // Split the time string into hours, minutes, and seconds
  const [hours, minutes, seconds] = timeString.split(":").map(Number);

  // Extract the year, month, and day from the input date
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Create a new Date object with the combined date and time
  return new Date(year, month, day, hours, minutes, seconds);
}

const allowedExtensions = [".csv", ".xls", ".xlsx"];

const isFileValid = (file) => {
  // Maximum file size in bytes (5MB)
  const maxSize = 20 * 1024 * 1024;

  // Allowed file extensions

  // Check file size
  if (file.size > maxSize) {
    return {
      code: "file-too-large",
      message: `The file  is large than 20 MB`,
    };
  }

  // Check file type by extension
  const fileExtension = file?.name?.split(".").pop().toLowerCase();
  if (!allowedExtensions.includes(`.${fileExtension}`)) {
    return {
      code: "file-not-allowed",
      message: `The file you upload is not allowed, file must me .xlsx, .csv or .xls`,
    };
  }

  return null;
};

export function BulkAttendanceModal({ open, setOpen, onComplete }: any) {
  const [file, setFile] = useState(undefined);
  const [errors, seterrors] = useState([]);

  const [fileError, setfileError] = useState("");

  const onDrop = useCallback(async (acceptedFiles: any) => {
    if (acceptedFiles[0]) {
      setfileError("");
    }
    setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    disabled: file,
    validator: isFileValid,
    onDropRejected: (e) => {
      setfileError(e.map((e) => e.errors[0].message)[0]);
    },
  });

  const [branch, setbranch] = useState(undefined);

  const [brachError, setbrachError] = useState(undefined);

  const reset = () => {
    setfileError(undefined);
    setbrachError(undefined);
    setFile(undefined);
    seterror(undefined);
    setsubmiting(false);
    setbranch(undefined);
    seterrors([]);
  };

  const { settings } = useSettings();

  const handleSubmit = () => {
    try {
      if (!file) return setfileError("Please upload a file.");
      if (!branch) return setbrachError("Please select a branch");

      setbrachError(undefined);
      setfileError(undefined);
      seterror(undefined);
      seterrors(undefined);
      setsubmiting(true);

      const reader = new FileReader();

      reader.onload = async function (e: any) {
        const data = new Uint8Array(e.target.result);
        const workbook = read(data, { type: "array" });

        // Assuming the first sheet is of interest
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert sheet data to JSON
        const json = utils.sheet_to_json(sheet, { header: 1 });

        const rows: any[] = json;

        // Check if columns are present
        const expectedColumns = [
          "Staff Id",
          "Attendance Date",
          "Clock In",
          "Clock Out",
        ];
        const columns: any = rows[0].map((e) => e.trim());

        const missingColumns = expectedColumns.filter(
          (column) => !columns.includes(column)
        );
        if (missingColumns.length > 0) {
          seterror(`Missing columns: ${missingColumns.join(", ")}`);
          setsubmiting(false);
          return;
        }

        // Handle valid data
        const attendanceData = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const date = row[columns.indexOf("Attendance Date")];
          const attendanceEntry = {
            employee: row[columns.indexOf("Staff Id")],
            date: date,
            clockin_time: row[columns.indexOf("Clock In")],
            clockout_time: row[columns.indexOf("Clock Out")],
            branch,
          };
          attendanceData.push(attendanceEntry);
        }

        const invalid_errors = await validateAttendanceData(attendanceData);
        console.log(invalid_errors);

        if (invalid_errors?.length !== 0) {
          console.log(invalid_errors);
          setsubmiting(false);
          return seterrors(invalid_errors);
        }

        await Promise.all(
          attendanceData.map((e) => {
            const currentDate = new Date(e.date);
            // Get current date
            var start_time_date = timeStringToDate(
              settings.work_start_time,
              new Date(e.date)
            );

            var clockin_time_date = convertTimeStringToDate(
              currentDate,
              e?.clockin_time
            );

            var clockout_time_date = convertTimeStringToDate(
              currentDate,
              e.clockout_time
            );

            start_time_date.setMinutes(
              start_time_date.getMinutes() + (settings?.early_clockin_mins || 0)
            );

            const behaviour =
              clockin_time_date > start_time_date ? "late" : "early";

            return pocketbase.collection("attendance").create({
              ...e,
              clockin_time: clockin_time_date,
              date: new Date(e.date),
              behaviour: behaviour,
              clockout_time: clockout_time_date,
            });
          })
        );
        setsubmiting(false);
        onComplete();
        reset();
        console.log("Attendance data:", attendanceData);
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.log(error);
      setsubmiting(false);
    }
  };

  const [submiting, setsubmiting] = useState(false);

  const [error, seterror] = useState(undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-[14.5px] px-2 font-semibold py-2-">
              Upload Bulk Attendance
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="px-3">
          {error && (
            <Alert
              variant="destructive"
              className="py-2 mt-3 rounded-[4px] flex items-center"
            >
              <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
              <AlertTitle className="text-[13px] font-medium fon !m-0">
                {error}
              </AlertTitle>
            </Alert>
          )}
          {errors?.length ? (
            <div className="bg-red-50 px-2 py-1 border-red-100 border rounded-md mb-2 mt-3">
              <ul className="list-decimal pl-5 my-2 text-sm space-y-3 text-red-500">
                {errors?.map((e: any) => {
                  return <li>{e}</li>;
                })}
              </ul>
            </div>
          ) : null}
          <div>
            <div
              {...getRootProps()}
              className={`w-full border-dashed relative cursor-pointer py-4 ${
                fileError
                  ? "hover:bg-red-100 hover:bg-opacity-70 bg-red-50 border-red-200"
                  : "hover:bg-gray-100 border-gray-200 "
              } border-2 flex-col  min-h-[100px] my-4 rounded-md flex items-center justify-center gap-3`}
            >
              <input {...getInputProps()} />

              <>
                {file ? (
                  <a
                    className="cursor-pointer"
                    onClick={() => {
                      setFile(null);
                    }}
                  >
                    <Trash size={20} className="text-red-800" />
                  </a>
                ) : (
                  <UploadCloud size={26} className="text-primary" />
                )}
                <span className="text-sm text-center font-medium   text-gray-600">
                  {file ? (
                    <a
                      target="_blank"
                      href={file}
                      className="text-[13px] cursor-pointer underline"
                    >
                      {file?.name}
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 flex-col justify-center">
                      <span className="text-[14.5px] font-medium text-slate-800">
                        Drag and drop files or{" "}
                        <a
                          href="#"
                          className="cursor-pointer hover:underline text-primary"
                        >
                          Browse
                        </a>
                      </span>
                      <span className="text-sm text-slate-500">
                        Supported formats: {allowedExtensions.map((e) => e)}
                      </span>
                    </div>
                  )}
                  {fileError && (
                    <span className="text-red-500 capitalize mt-3 text-[13px] font-medium block text-center">
                      {fileError ? "* " + fileError : ""}
                    </span>
                  )}
                </span>
              </>
            </div>
            <div>
              <AsyncSelectField
                placeholder="Choose branch"
                defaultOptions={true}
                onChange={(e) => {
                  setbranch(e.value);
                }}
                error={brachError}
                value={branch}
                name="branches"
                loader={({ search }) => {
                  return pocketbase
                    .collection("branches")
                    .getFullList(
                      cleanObject({
                        filter: search ? `name~"${search}"` : "",
                      })
                    )
                    .then((e) =>
                      e.map((e) => ({ label: e.name, value: e.id }))
                    );
                }}
              />
            </div>
            {!errors?.length ? (
              <div className="bg-slate-50 px-2 py-1 border-slate-100 border rounded-md mb-2 mt-3">
                <ul className="list-decimal pl-5 my-2 text-sm space-y-3 text-slate-500">
                  <li>
                    Download the template{" "}
                    <a
                      href="/sample_attendance.xlsx"
                      className="text-primary underline"
                    >
                      Click to download
                    </a>
                  </li>
                  <li>Fill the attendance with proper data.</li>
                  <li>Upload the attendance file here.</li>
                </ul>
              </div>
            ) : null}
            <div className="flex justify-end mt-3 gap-2 items-end">
              <Button
                onClick={() => {
                  reset();
                }}
                variant="secondary"
                className="text-primary"
                size="sm"
              >
                Reset
              </Button>
              <Button
                onClick={() => handleSubmit()}
                disabled={submiting}
                size="sm"
              >
                {submiting && (
                  <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                )}
                Upload Attendance
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
