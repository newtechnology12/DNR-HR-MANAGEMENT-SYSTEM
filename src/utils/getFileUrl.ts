import pocketbase from "@/lib/pocketbase";

const getFileUrl = ({ file, collection, record }) => {
  // Check if the file reference is valid
  if (!file || file === "0") {
    return undefined; // Return undefined if the file is missing or invalid
  }

  // Generate the file URL against the same backend the app talks to
  return pocketbase.buildUrl(`/api/files/${collection}/${record}/${file}`);
};

export default getFileUrl;
