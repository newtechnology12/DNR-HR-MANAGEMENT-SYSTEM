import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
  import { AlertCircleIcon, Trash, UploadCloud } from "lucide-react";
  import { useCallback, useState } from "react";
  import { useDropzone } from "react-dropzone";
  import { Button } from "../ui/button";
  import { read, utils, write } from "xlsx";
  import Loader from "../icons/Loader";
  import { Alert, AlertTitle } from "@/components/ui/alert";
  import { saveAs } from "file-saver";
  import pocketbase from "@/lib/pocketbase";
  
  const allowedExtensions = [".xlsx", ".xls"];
  
  const isFileValid = (file) => {
    // Maximum file size in bytes (5MB)
    const maxSize = 20 * 1024 * 1024;
  
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
        message: `The file you upload is not allowed, file must me .xlsx`,
      };
    }
  
    return null;
  };
  
  export function BulkImport({
    open,
    setOpen,
    sample,
    expectedColumns,
    parseEntity,
    name,
    validate,
    onComplete,
    handleBulk,
  }: any) {
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
  
    const reset = () => {
      setfileError(undefined);
      setFile(undefined);
      seterror(undefined);
      setsubmiting(false);
      seterrors([]);
    };
  
    const handleSubmit = () => {
      try {
        if (!file) return setfileError("Please upload a file.");
  
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
  
          const columns: any = rows[0].map((e) => e.trim());
  
          const missingColumns = expectedColumns.filter(
            (column) => !columns.includes(column)
          );
  
          if (missingColumns.length > 0) {
            seterror(`Missing columns: ${missingColumns.join(", ")}`);
            setsubmiting(false);
            return;
          }
  
          // Extract headers (first row) and data (remaining rows)
          const headers = rows[0];
          const dataRows = rows.slice(1);
  
          // Map headers to data rows
          const mappedData = dataRows
            .filter((e) => e.length)
            .map((row) => {
              let rowObject = {};
              headers.forEach((header, index) => {
                rowObject[header] = row[index];
              });
              return rowObject;
            });
  
          // Handle valid data
          const datas = [];
  
          for (let i = 0; i < mappedData.length; i++) {
            const row = mappedData[i];
            const entry = parseEntity(row);
            datas.push(entry);
          }
  
          const invalid_errors = await validate(datas);
  
          if (invalid_errors?.length !== 0) {
            setsubmiting(false);
            return seterrors(invalid_errors);
          }
  
          if (handleBulk) {
            await handleBulk({ rows: datas, setsubmiting, onComplete, reset });
          } else {
            const created = [];
  
            try {
              for await (let e of datas) {
                const data = await pocketbase.collection(name).create(e);
  
                created.push(data.id);
              }
              setsubmiting(false);
              onComplete();
              reset();
            } catch (error) {
              console.log(error?.message, "---- error ----");
              setsubmiting(false);
              // delete all the data that was created
              for await (let e of created) {
                await pocketbase.collection(name).delete(e);
              }
            }
          }
        };
  
        reader.readAsArrayBuffer(file);
      } catch (error) {
        setsubmiting(false);
      }
    };
  
    const [submiting, setsubmiting] = useState(false);
  
    const [error, seterror] = useState(undefined);
  
    const downloadTemplate = () => {
      var sheetData = sample.map((obj) => Object.values(obj));
      sheetData.unshift(Object.keys(sample[0]));
      var wb = utils.book_new();
      var ws = utils.aoa_to_sheet(sheetData);
      utils.book_append_sheet(wb, ws, "Sheet1");
      const wbout = write(wb, { bookType: "xlsx", type: "array" });
      var blob = new Blob([wbout], { type: "application/octet-stream" });
  
      saveAs(blob, `sample_${name}_${new Date().toLocaleString("en-US")}.xlsx`);
    };
  
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              <span className="text-[14px] px-2 font-semibold block pt-1">
                Upload Bulk Data
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="px-2">
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
            {/* <div>
              <a href="">Download Error logs</a>
            </div> */}
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
                        <span className="text-[13.5px] font-medium text-slate-800">
                          Drag and drop files or{" "}
                          <a
                            href="#"
                            className="cursor-pointer hover:underline text-primary"
                          >
                            Browse
                          </a>
                        </span>
                        <span className="text-sm font-normal text-slate-500">
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
  
              {!errors?.length ? (
                <div className="bg-slate-50 px-2 py-1 border-slate-100 border rounded-md mb-2 mt-3">
                  <ul className="list-decimal pl-5 my-2 text-sm space-y-3 text-slate-500">
                    <li>
                      Download the template{" "}
                      <a
                        onClick={() => downloadTemplate()}
                        className="text-primary cursor-pointer underline"
                      >
                        Click to download
                      </a>
                    </li>
                    <li>Fill the spread sheet with proper data.</li>
                    <li>Upload the data file here.</li>
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
                  Start Importing
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  