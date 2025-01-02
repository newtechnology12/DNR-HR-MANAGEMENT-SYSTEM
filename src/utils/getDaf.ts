const getDaf = (date, column?: any) => {
  const from = date.from;
  const to = date.to;

  if (from && to) {
    let beginTime: any = new Date(from);
    beginTime.setHours(0, 0, 0, 0);
    beginTime = beginTime.toISOString().replace("T", " ");

    let stopTime: any = new Date(to);
    stopTime.setHours(23, 59, 59, 999);
    stopTime = stopTime.toISOString().replace("T", " ");

    return `${column || "created"} >= "${beginTime}" && ${
      column || "created"
    } <= "${stopTime}"`;
  } else if (from) {
    let beginTime: any = new Date(from);
    beginTime.setHours(0, 0, 0, 0);
    beginTime = beginTime.toISOString().replace("T", " ");

    let stopTime: any = new Date(from);
    stopTime.setHours(23, 59, 59, 999);
    stopTime = stopTime.toISOString().replace("T", " ");

    const dd = `${column || "created"} >= "${beginTime}" && ${
      column || "created"
    } <= "${stopTime}"`;
    return dd;
  }
  return "";
};

export default getDaf;
