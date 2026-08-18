import { redirect } from "next/navigation";
import avayaData from "../avaya-data.json";
import supplyDashboardData from "../dashboard-data.json";
import clientDashboardData from "../dashboard-client-data.json";
import { hasFullDashboardAccess, scopeDashboardsToUser } from "../dashboard-permissions";
import { getDashboardUser } from "../session-auth";
import Dashboard, { type AvayaDashboardData } from "./Dashboard";
import type { DashboardData } from "./dashboard-types";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const user = await getDashboardUser();
  if (!user) redirect("/");
  const fullAccess = hasFullDashboardAccess(user);
  const dashboards = scopeDashboardsToUser([
    supplyDashboardData as unknown as DashboardData,
    clientDashboardData as unknown as DashboardData,
  ], user);
  const avaya = avayaData as unknown as AvayaDashboardData;
  const scopedAvaya = fullAccess ? avaya : {
    ...avaya,
    agents: avaya.agents[user.displayName] ? { [user.displayName]: avaya.agents[user.displayName] } : {},
  };
  return <Dashboard userName={user.displayName} userRole={user.role} hasFullAccess={fullAccess} initialDashboards={dashboards} avayaDashboard={scopedAvaya} />;
}
