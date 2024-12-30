function cleanObject(obj) {
  for (const key in obj) {
    if (obj[key] === undefined || obj[key] === null || obj[key] === "") {
      delete obj[key];
    }
  }
  return obj;
}
export default cleanObject;
