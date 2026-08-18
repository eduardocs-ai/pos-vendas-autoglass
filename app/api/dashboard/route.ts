import { desc } from "drizzle-orm";
import supplyDashboardData from "../../dashboard-data.json";
import clientDashboardData from "../../dashboard-client-data.json";
import { getDashboardUser } from "../../session-auth";
import { getDb } from "../../../db";
import { dashboardSnapshots } from "../../../db/schema";
import type { DashboardData } from "../../painel/dashboard-types";

export const dynamic = "force-dynamic";

async function authenticatedUser() {
  return getDashboardUser();
}

function dashboardTeam(dashboard: DashboardData) {
  return isOfficialSupplyJuly(dashboard) ? "Time Fornecimento" : (dashboard.meta.team ?? "Time Fornecimento");
}

function isOfficialSupplyJuly(dashboard: DashboardData) {
  return dashboard.meta.periodKey === "2026-07"
    && dashboard.meta.serviceRows === 1142
    && dashboard.agents["Luciano Padilha"]?.attendanceCount === 308
    && dashboard.agents["Lívia Neves"]?.attendanceCount === 273;
}

function dashboardPeriodKey(dashboard: DashboardData) {
  return dashboard.meta.periodKey ?? dashboard.meta.period;
}

function mergeDashboards(dashboards: DashboardData[]) {
  const unique = new Map<string, DashboardData>();
  dashboards.forEach((dashboard) => {
    const team = dashboardTeam(dashboard);
    const key = `${team}:${dashboardPeriodKey(dashboard)}`;
    const normalized = { ...dashboard, meta: { ...dashboard.meta, team } };
    const current = unique.get(key);
    if (current && isOfficialSupplyJuly(current) && !isOfficialSupplyJuly(normalized)) return;
    unique.set(key, normalized);
  });
  return [...unique.values()];
}

function bundledDashboards() {
  return [
    supplyDashboardData as unknown as DashboardData,
    clientDashboardData as unknown as DashboardData,
  ];
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const snapshots = await getDb().select().from(dashboardSnapshots).orderBy(desc(dashboardSnapshots.id)).limit(120);
    if (!snapshots.length) {
      const dashboards = bundledDashboards();
      return Response.json({ dashboard: dashboards[0] ?? null, dashboards });
    }
    const uniquePeriods = new Map<string, DashboardData>();
    for (const snapshot of snapshots) {
      const parsed = JSON.parse(snapshot.payload) as DashboardData;
      const team = dashboardTeam(parsed);
      const dashboard = { ...parsed, meta: { ...parsed.meta, team } };
      const key = `${team}:${dashboard.meta.periodKey ?? dashboard.meta.period}`;
      if (uniquePeriods.has(key)) continue;
      uniquePeriods.set(key, dashboard);
    }
    const dashboards = mergeDashboards([...bundledDashboards(), ...Array.from(uniquePeriods.values())]);
    const snapshot = snapshots[0];
    return Response.json({
      dashboard: dashboards[0],
      dashboards,
      importedBy: snapshot.importedBy,
      createdAt: snapshot.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar os dados";
    if (message.includes("no such table")) return Response.json({ dashboard: null });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = (await request.json()) as { dashboard?: DashboardData };
    const dashboard = body.dashboard;
    if (!dashboard?.meta?.period || !dashboard.agents) {
      return Response.json({ error: "Dados de importação inválidos" }, { status: 400 });
    }
    const sourceFiles = dashboard.meta.sourceFiles ?? [];
    const team = dashboard.meta.team ?? "Time Fornecimento";
    const [snapshot] = await getDb().insert(dashboardSnapshots).values({
      period: `${team} · ${dashboard.meta.period}`,
      payload: JSON.stringify(dashboard),
      sourceFiles: JSON.stringify(sourceFiles),
      importedBy: user.username,
    }).returning();
    return Response.json({ dashboard, importedBy: snapshot.importedBy, createdAt: snapshot.createdAt }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar os dados";
    return Response.json({ error: message }, { status: 500 });
  }
}
