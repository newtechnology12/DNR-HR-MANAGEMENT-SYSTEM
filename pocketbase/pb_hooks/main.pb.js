routerAdd("GET", "/hello/:name", (c) => {
  let name = c.pathParam("name");

  return c.json(200, { message: "Hello " + name });
});

// prints "Hello!" every day
cronAdd("end-clockin", "@daily", () => {
  const open_attendances = $app
    .dao()
    .findRecordsByFilter("attendance", "clockout_time = ''");

  for (let item of open_attendances || []) {
    const clocked_in_time = new Date(
      item.getString("clockin_time").replace(" ", "T")
    );
    // check if greater than 14 hours
    if (new Date() - clocked_in_time > 14 * 60 * 60 * 1000) {
      item.set("clockout_time", new Date());
      $app.dao().saveRecord(item);
      console.log("ended attendance", item.get("id"));
    }
  }
  console.log("ended all open attendances --> ", open_attendances.length);
});
