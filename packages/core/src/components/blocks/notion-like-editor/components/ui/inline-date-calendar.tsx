import { Calendar } from "@/components/calendar";

import {
  calendarDateToStoredDate,
  storedDateToCalendarDate,
} from "../../lib/features/editor-date-value";

// The calendar body is loaded on demand, so react-day-picker stays out of the editor's first load.
// The stored date's month is shown with its day selected. The focus goes to that day (or today).
export default function InlineDateCalendar({
  stored,
  onPick,
}: {
  stored: string;
  onPick: (date: string) => void;
}) {
  const selected = storedDateToCalendarDate(stored);

  return (
    <Calendar
      mode="single"
      required
      autoFocus
      selected={selected}
      defaultMonth={selected ?? new Date()}
      onSelect={(date) => {
        const next = calendarDateToStoredDate(date);
        if (next !== null) {
          onPick(next);
        }
      }}
    />
  );
}
