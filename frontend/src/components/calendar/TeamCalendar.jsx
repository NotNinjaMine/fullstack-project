import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import dayjs from "dayjs";

// FullCalendar wrapper showing teammates' approved leave + the employee's
// country public holidays, dates only per staff access rules (UC-08)
export default function TeamCalendar({ holidays, team, approvedLeaves, currentUserId }) {
  const memberById = (id) => team.find((t) => t.id === id);

  const holidayEvents = holidays.map((h) => ({
    id: `holiday-${h.date}`,
    title: `🎌 ${h.name}`,
    start: h.date,
    allDay: true,
    backgroundColor: "#fde68a",
    borderColor: "#f59e0b",
    textColor: "#78350f",
  }));

  const leaveEvents = approvedLeaves.map((l, i) => {
    const m = memberById(l.userId);
    const isMe = l.userId === currentUserId;
    return {
      id: `leave-${i}`,
      title: `${m?.initials ?? "?"}${isMe ? " (you)" : ""}${l.halfDay ? " ½" : ""}`,
      start: l.startDate,
      end: dayjs(l.endDate).add(1, "day").format("YYYY-MM-DD"),
      allDay: true,
      backgroundColor: isMe ? "#0d9488" : "#64748b",
      borderColor: isMe ? "#0f766e" : "#475569",
    };
  });

  return (
    <FullCalendar
      plugins={[dayGridPlugin]}
      initialView="dayGridMonth"
      height="auto"
      firstDay={1}
      events={[...holidayEvents, ...leaveEvents]}
      eventDisplay="block"
      dayMaxEventRows={3}
      headerToolbar={{ left: "title", right: "prev,next today" }}
    />
  );
}
