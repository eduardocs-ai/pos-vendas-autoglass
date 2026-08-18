import type { DashboardUser } from "./session-auth";
import type { DashboardData } from "./painel/dashboard-types";

const FULL_ACCESS_USERS = new Set<DashboardUser["username"]>([
  "eduardo.calegari",
  "milena.vassoler",
  "elizandra.viana",
]);

export function hasFullDashboardAccess(user: Pick<DashboardUser, "username">) {
  return FULL_ACCESS_USERS.has(user.username);
}

export function scopeDashboardToUser(dashboard: DashboardData, user: DashboardUser): DashboardData | null {
  if (hasFullDashboardAccess(user)) return dashboard;
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
