const getFileUrl = ({ file, collection, record }) => {
  return file
    ? `${
        import.meta.env.VITE_POCKETBASE_URL
      }/api/files/${collection}/${record}/${file}`
    : undefined;
};

export default getFileUrl;
