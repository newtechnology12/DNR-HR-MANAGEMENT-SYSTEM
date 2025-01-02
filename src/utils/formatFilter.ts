import getDaf from "./getDaf";

const formatFilter = (columnFilters) => {
  const filters = columnFilters
    .map((e) => {
      if (e.value["from"]) {
        const dd = getDaf(e.value);
        return dd;
      } else {
        return `(${e.value
          .map(
            (p) =>
              `${e.id.replace(/__/g, ".")}="${
                p.value ? (p.value === "." ? "" : p.value) : p
              }"`
          )
          .join(" || ")})`;
      }
    })
    .join(" && ");

  return filters;
};

export default formatFilter;
