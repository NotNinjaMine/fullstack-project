import api from "./api";

export const getTeamCalendar = () => api.get("/leave/team-calendar").then((res) => res.data);

export const getHolidays = () => api.get("/holiday").then((res) => res.data);
