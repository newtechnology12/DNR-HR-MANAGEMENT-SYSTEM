import { Trash, UploadCloud } from "react-feather";
import { useDropzone } from "react-dropzone";
import { useCallback, useState } from "react";

const isFileValid = (file) => {
  // Maximum file size in bytes (5MB)
  const maxSize = 20 * 1024 * 1024;

  // Allowed file extensions
  const allowedExtensions = [
    ".png",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".docx",
    ".xls",
    ".xlsx",
    ".doc",
    ".ppt",
    ".pptx",
  ];

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
      message: `The file you upload is not allowed.`,
    };
  }

  return null;
};
export default function Dropzone({
  onChange,
  file,
  error,
  label,
  preview,
}: any) {
  const [fileError, setfileError] = useState("");
  const onDrop = useCallback(async (acceptedFiles: any) => {
    if (acceptedFiles[0]) {
      setfileError("");
      onChange(acceptedFiles[0]);
      handleFileChange(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    disabled: file,
    validator: isFileValid,
    onDropRejected: (e) => {
      setfileError(e.map((e) => e.errors[0].message)[0]);
    },
  });

  const [previewUrl, setPreviewUrl] = useState(null);

  const handleFileChange = (file) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const formatPreviewLink = (file) => {
    return `https://docs.google.com/viewer?url=${file}`;
  };

  return (
    <div
      {...getRootProps()}
      className={`w-full border-dashed relative cursor-pointer py-4 ${
        error || fileError
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
              onChange("");
              setPreviewUrl(null);
            }}
          >
            <Trash size={20} className="text-red-800" />
          </a>
        ) : (
          <UploadCloud size={16} className="text-primary" />
        )}
        <span className="text-sm text-center font-medium   text-gray-600">
          {file ? (
            <a
              target="_blank"
              href={formatPreviewLink(preview || file)}
              className="text-[13px] cursor-pointer underline"
            >
              {file?.name || file}
            </a>
          ) : (
            <span className="text-[13px]">{label}</span>
          )}
          {(error || fileError) && (
            <span className="text-red-500 capitalize mt-3 text-[13px] font-medium block text-center">
              {error ? "* " + error : ""}
              {fileError ? "* " + fileError : ""}
            </span>
          )}
        </span>
        {((preview && file) || previewUrl) && (
          <div>
            <img
              className="max-w-xs border max-h-64 rounded-md"
              src={previewUrl || preview}
              alt=""
            />
          </div>
        )}
      </>
    </div>
  );
}
