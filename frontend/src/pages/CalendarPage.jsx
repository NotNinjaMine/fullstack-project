import { useState, useEffect } from "react";
import useAuth from "../hooks/useAuth";
import { getTeamCalendar, getHolidays } from "../services/calendarService";
import LoadingSpinner from "../components/common/LoadingSpinner";
import TeamCalendar from "../components/calendar/TeamCalendar";
import PublicHolidayLegend from "../components/calendar/PublicHolidayLegend";

// UC-06, UC-08: team calendar with the employee's country public holidays
export default function CalendarPage() {
  const { user } = useAuth();
  const [holidays, setHolidays] = useState([]);
  const [team, setTeam] = useState([]);
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getHolidays(), getTeamCalendar()])
      .then(([h, cal]) => {
        setHolidays(h);
        setTeam(cal.team);
        setApprovedLeaves(cal.approved);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4">
        <TeamCalendar
          holidays={holidays}
          team={team}
          approvedLeaves={approvedLeaves}
          currentUserId={user.id}
        />
      </div>
      <div className="space-y-6">
        <PublicHolidayLegend holidays={holidays} country={user.country} />
      </div>
    </div>
  );
}
