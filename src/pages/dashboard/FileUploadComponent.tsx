import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";

function FileUploadComponent() {
  const [files, setFiles] = useState<File[]>([]);
  const { setValue } = useFormContext();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(event.target.files || []);
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    setValue("files", [...files, ...newFiles]);
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    setValue("files", newFiles);
  };

  return (
    <div className="grid gap-2">
      <input type="file" multiple onChange={handleFileChange} />
      <div>
        {files.map((file, index) => (
          <div key={index} className="flex items-center gap-2">
            <span>{file.name}</span>
            <Button type="button" onClick={() => removeFile(index)} className="h-8">
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FileUploadComponent;