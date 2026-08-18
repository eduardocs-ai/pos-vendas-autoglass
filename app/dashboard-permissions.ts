import type { DashboardUser } from "./session-auth";
import type { DashboardData, TeamName } from "./painel/dashboard-types";

const FULL_ACCESS_USERS = new Set<DashboardUser["username"]>([
  "eduardo.calegari",
  "milena.vassoler",
  "elizandra.viana",
]);

const TEAM_ACCESS_USERS: Partial<Record<DashboardUser["username"], TeamName[]>> = {
  "livia.neves": ["Time Fornecimento"],
};

export function hasFullDashboardAccess(user: Pick<DashboardUser, "username">) {
  return FULL_ACCESS_USERS.has(user.username);
}

export function allowedDashboardTeams(user: Pick<DashboardUser, "username">): TeamName[] | null {
  if (hasFullDashboardAccess(user)) return null;
  return TEAM_ACCESS_USERS[user.username] ?? [];
}

export function hasDashboardManagementAccess(user: Pick<DashboardUser, "username">) {
  const allowedTeams = allowedDashboardTeams(user);
  return allowedTeams === null || allowedTeams.length > 0;
}

export function dashboardTeam(dashboard: DashboardData): TeamName {
  return dashboard.meta.team ?? "Time Fornecimento";
}

export function canAccessDashboardTeam(user: Pick<DashboardUser, "username">, team: TeamName) {
  const allowedTeams = allowedDashboardTeams(user);
  return allowedTeams === null || allowedTeams.includes(team);
}

export function scopeDashboardToUser(dashboard: DashboardData, user: DashboardUser): DashboardData | null {
  if (hasFullDashboardAccess(user)) return dashboard;
  if (canAccessDashboardTeam(user, dashboardTeam(dashboard))) return dashboard;
  const agent = dashboard.agents[user.displayName];
  if (!agent) return null;
  return {
    ...dashboard,
    agents: {
      [user.displayName]: agent,
    },
  };
}

export function scopeDashboardsToUser(dashboards: DashboardData[], user: DashboardUser) {
  return dashboards
    .map((dashboard) => scopeDashboardToUser(dashboard, user))
    .filter((dashboard): dashboard is DashboardData => Boolean(dashboard));
}
