const getFileUrl = ({ file, collection, record }) => {
  return file
    ? `https://pocketbase-production-f0b0.up.railway.app/api/files/${collection}/${record}/${file}`
    : undefined;
};

export default getFileUrl;
