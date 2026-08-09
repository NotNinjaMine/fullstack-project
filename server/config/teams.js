// Single source of truth for the teams an account can belong to.
// Teams are a fixed, closed list — every form that asks for a team renders a
// dropdown from GET /coverage/options, and every route that accepts a team
// validates against TEAMS. Free-typed team names are rejected, so blackout
// scopes, team calendars and approval routing can never drift apart because
// of a typo ("Compliance Team A " vs "Compliance team A").
const TEAMS = ["Compliance Team A", "Compliance Team B"];

const DEFAULT_TEAM = TEAMS[0];

const isValidTeam = (team) => TEAMS.includes(String(team || "").trim());

module.exports = { TEAMS, DEFAULT_TEAM, isValidTeam };
