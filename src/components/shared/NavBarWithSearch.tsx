/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Calendar, ChevronDown } from "react-feather";
import CalendarModal from "../CalendarModal";
import dayjs from "dayjs";

export default function NavBarWithSearch({
  title,
  setDateFitlter,
  dateFitlter,
}: {
  title: string;
  dateFitlter?: any;
  setDateFitlter?: any;
  searchPlaceholder?: string;
}) {
  const [showCalendarModal, setshowCalendarModal] = useState(false);

  return (
    <>
      <CalendarModal
        selected={dateFitlter}
        setdate={setDateFitlter}
        open={showCalendarModal}
        setOpen={setshowCalendarModal}
      />
    </>
  );
}
