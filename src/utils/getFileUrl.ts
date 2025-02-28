const getFileUrl = ({ file, collection, record }) => {
  // Check if the file reference is valid
  if (!file || file === "0") {
    return undefined; // Return undefined if the file is missing or invalid
  }

  // Generate the file URL
  return `https://pocketbase-production-f0b0.up.railway.app/api/files/${collection}/${record}/${file}`;
};

export default getFileUrl;