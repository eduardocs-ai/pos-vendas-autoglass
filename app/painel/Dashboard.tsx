"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { processReportFiles } from "./report-parser";
import LogoutButton from "./LogoutButton";
import type { AgentData, DailyAttendance, DashboardData, RatingName, RecentCall, TeamName } from "./dashboard-types";

type RatingFilter = "Todas" | RatingName;
type ViewName = "overview" | "agents" | "avaya" | "uploads";

type AvayaMetrics = {
  callCount: number;
  answeredCalls: number;
  missedCalls: number;
  abandonedCalls: number;
  transferredCalls: number;
  talkSeconds?: number;
  queueSeconds?: number;
  holdSeconds?: number;
  totalSeconds?: number;
  pauseCount: number;
  pauseTypes: Record<string, number>;
  pauseSeconds?: number;
  loggedSeconds?: number;
  averagePauseSeconds: number;
  averageLoggedSeconds: number;
  averageTalkSeconds: number;
  averageQueueSeconds: number;
};

type AvayaAgentData = AvayaMetrics & { daily: Record<string, AvayaMetrics> };
export type AvayaDashboardData = {
  meta: {
    period: string;
    hasPauseData: boolean;
    hasLoggedData: boolean;
    typeCounts: Record<string, number>;
  };
  team: AvayaAgentData;
  agents: Record<string, AvayaAgentData>;
};

const ratingOrder: RatingName[] = ["Ruim", "Regular", "Bom", "Ótimo"];
const ratingColors: Record<RatingName, string> = { Ruim: "#ef5b55", Regular: "#f5a524", Bom: "#55a8ff", Ótimo: "#20b486" };
const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const teams: TeamName[] = ["Time Cliente", "Time Fornecimento"];
const teamAgentGroups: Record<TeamName, string[]> = {
  "Time Cliente": ["Gerlaine Lima", "Emilly Freitas", "Raissa de Oliveira Rauta", "Iasmim Macedo"],
  "Time Fornecimento": ["Luciano Padilha", "Lívia Neves", "Eduardo Calegari", "Amanda Piaz"],
};
const indicatorExcludedAgents = new Set(["Elizandra Viana", "Rhanaiza Kinack", "Stefany Moreira"]);
type DashboardUserRole = "agent" | "leader" | "coordinator";

const leaderGroups = [
  { leader: "Elizandra Viana", roleLabel: "Líder", agents: ["Luciano Padilha", "Lívia Neves", "Eduardo Calegari", "Amanda Piaz", "Gerlaine Lima", "Emilly Freitas", "Raissa de Oliveira Rauta", "Iasmim Macedo"] },
  { leader: "Rhanaiza Kinack", roleLabel: "Líder", agents: [] },
  { leader: "Lorraine Santos", roleLabel: "Líder", agents: [] },
  { leader: "Stefany Moreira", roleLabel: "Líder", agents: [] },
];

const displayToDataAgentName: Record<string, string> = {
  "Luciano Padilla": "Luciano Padilha",
};

function dashboardTeam(dashboard: DashboardData): TeamName {
  return isOfficialSupplyJuly(dashboard) ? "Time Fornecimento" : (dashboard.meta.team ?? "Time Fornecimento");
}

function isOfficialSupplyJuly(dashboard: DashboardData) {
  return dashboard.meta.periodKey === "2026-07"
    && dashboard.meta.serviceRows === 1142
    && dashboard.agents["Luciano Padilha"]?.attendanceCount === 308
    && dashboard.agents["Lívia Neves"]?.attendanceCount === 273;
}

function normalizeDashboardData(dashboard: DashboardData): DashboardData {
  const agents = { ...dashboard.agents };
  if (agents["Amanda Piazza"] && !agents["Amanda Piaz"]) {
    agents["Amanda Piaz"] = agents["Amanda Piazza"];
    delete agents["Amanda Piazza"];
  }
  const normalized = { ...dashboard, meta: { ...dashboard.meta, team: dashboardTeam(dashboard) }, agents };
  return normalized;
}

function dashboardPeriodKey(dashboard: DashboardData) {
  if (dashboard.meta.periodKey) return dashboard.meta.periodKey;
  const [monthName, yearText] = dashboard.meta.period.split(/\s+de\s+/i);
  const month = monthNames.findIndex((name) => name.toLocaleLowerCase("pt-BR") === monthName?.toLocaleLowerCase("pt-BR"));
  return month >= 0 && yearText ? `${yearText}-${String(month + 1).padStart(2, "0")}` : dashboard.meta.period;
}

function sortDashboards(dashboards: DashboardData[]) {
  return [...dashboards].sort((a, b) => dashboardPeriodKey(a).localeCompare(dashboardPeriodKey(b)));
}

function mergeDashboards(dashboards: DashboardData[]) {
  const unique = new Map<string, DashboardData>();
  dashboards.forEach((dashboard) => {
    const key = `${dashboardTeam(dashboard)}:${dashboardPeriodKey(dashboard)}`;
    const current = unique.get(key);
    if (current && isOfficialSupplyJuly(current) && !isOfficialSupplyJuly(dashboard)) return;
    unique.set(key, dashboard);
  });
  return sortDashboards([...unique.values()]);
}

function formatDuration(seconds: number, total = false) {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (total && hours >= 1000) return `${hours.toLocaleString("pt-BR")}h ${String(minutes).padStart(2, "0")}min`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min ${String(seconds % 60).padStart(2, "0")}s`;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatMaybeDuration(seconds: number, available = true) {
  return available && seconds ? formatDuration(seconds) : "—";
}

function formatDateLabel(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function aggregateAvayaAgents(agents: AvayaAgentData[]): AvayaAgentData {
  const result: AvayaAgentData = {
    callCount: 0, answeredCalls: 0, missedCalls: 0, abandonedCalls: 0, transferredCalls: 0,
    talkSeconds: 0, queueSeconds: 0, holdSeconds: 0, totalSeconds: 0,
    pauseCount: 0, pauseTypes: {}, pauseSeconds: 0, loggedSeconds: 0,
    averagePauseSeconds: 0, averageLoggedSeconds: 0, averageTalkSeconds: 0, averageQueueSeconds: 0,
    daily: {},
  };
  agents.forEach((agent) => {
    result.callCount += agent.callCount;
    result.answeredCalls += agent.answeredCalls;
    result.missedCalls += agent.missedCalls;
    result.abandonedCalls += agent.abandonedCalls;
    result.transferredCalls += agent.transferredCalls;
    result.talkSeconds = (result.talkSeconds ?? 0) + (agent.talkSeconds ?? agent.averageTalkSeconds * agent.answeredCalls);
    result.queueSeconds = (result.queueSeconds ?? 0) + (agent.queueSeconds ?? agent.averageQueueSeconds * agent.callCount);
    result.pauseCount += agent.pauseCount;
    result.pauseSeconds = (result.pauseSeconds ?? 0) + (agent.pauseSeconds ?? agent.averagePauseSeconds * agent.pauseCount);
    result.loggedSeconds = (result.loggedSeconds ?? 0) + (agent.loggedSeconds ?? agent.averageLoggedSeconds * agent.callCount);
    Object.entries(agent.pauseTypes).forEach(([type, count]) => { result.pauseTypes[type] = (result.pauseTypes[type] ?? 0) + count; });
  });
  result.averageTalkSeconds = result.answeredCalls ? Math.round((result.talkSeconds ?? 0) / result.answeredCalls) : 0;
  result.averageQueueSeconds = result.callCount ? Math.round((result.queueSeconds ?? 0) / result.callCount) : 0;
  result.averagePauseSeconds = result.pauseCount ? Math.round((result.pauseSeconds ?? 0) / result.pauseCount) : 0;
  result.averageLoggedSeconds = result.callCount ? Math.round((result.loggedSeconds ?? 0) / result.callCount) : 0;
  return result;
}

function aggregateAgents(dashboard: DashboardData, names: string[]) {
  return teamMetrics({ ...dashboard, agents: Object.fromEntries(names.filter((name) => dashboard.agents[name]).map((name) => [name, dashboard.agents[name]])) });
}

function scopeDashboardToAgents(dashboard: DashboardData, names: string[]) {
  const allowed = new Set(names);
  return { ...dashboard, agents: Object.fromEntries(Object.entries(dashboard.agents).filter(([name]) => allowed.has(name))) };
}

function avayaNamesForContext(avayaDashboard: AvayaDashboardData, team: TeamName, leaderGroup?: { agents: string[] } | null) {
  const teamAgents = teamAgentGroups[team];
  return teamAgents.filter((name) =>
    avayaDashboard.agents[name]
    && !indicatorExcludedAgents.has(name)
    && (!leaderGroup || leaderGroup.agents.includes(name))
  );
}

function loggedComparisonRows(avayaDashboard: AvayaDashboardData, names: string[], dashboard?: DashboardData | null) {
  return names.map((name) => {
    const agent = dashboard?.agents[name] as (AgentData & { loggedSeconds?: number }) | undefined;
    const avaya = avayaDashboard.agents[name];
    const ascSeconds = agent?.loggedSeconds ?? 0;
    const avayaSeconds = avaya?.loggedSeconds ?? 0;
    const hasAsc = ascSeconds > 0;
    const hasAvaya = avayaDashboard.meta.hasLoggedData && avayaSeconds > 0;
    const diff = hasAsc && hasAvaya ? Math.abs(ascSeconds - avayaSeconds) : 0;
    const base = hasAsc && hasAvaya ? Math.max(ascSeconds, avayaSeconds) : 0;
    const disparity = base ? (diff / base) * 100 : 0;
    const status = !hasAsc && !hasAvaya ? "waiting" : !hasAsc || !hasAvaya ? "partial" : disparity <= 10 ? "ok" : disparity <= 25 ? "warn" : "alert";
    const label = status === "waiting" ? "Aguardando dados" : status === "partial" ? "Dados parciais" : status === "ok" ? "Ok" : status === "warn" ? "Atenção" : "Divergente";
    return { name, ascSeconds, avayaSeconds, hasAsc, hasAvaya, diff, disparity, status, label };
  });
}

function dailyFromRecent(agent: AgentData) {
  const daily: Record<string, DailyAttendance> = {};
  agent.recent.forEach((call) => {
    const date = parseDisplayDate(call.date);
    if (!date) return;
    const key = date.toISOString().slice(0, 10);
    const item = daily[key] ?? (daily[key] = {
      date: key, attendanceCount: 0, completedCount: 0, timedCount: 0, totalSeconds: 0, averageSeconds: 0,
      firstResponseCount: 0, firstResponseSeconds: 0, averageFirstResponseSeconds: 0,
    });
    item.attendanceCount += 1;
    if (call.finished) item.completedCount += 1;
    if (call.finished && call.seconds > 0) {
      item.timedCount += 1;
      item.totalSeconds += call.seconds;
    }
    if (typeof call.firstResponseSeconds === "number") {
      item.firstResponseCount += 1;
      item.firstResponseSeconds += call.firstResponseSeconds;
    }
  });
  Object.values(daily).forEach((item) => {
    item.averageSeconds = item.timedCount ? Math.round(item.totalSeconds / item.timedCount) : 0;
    item.averageFirstResponseSeconds = item.firstResponseCount ? Math.round(item.firstResponseSeconds / item.firstResponseCount) : 0;
  });
  return daily;
}

function parseDisplayDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function agentProductivityRows(agent: AgentData, avaya?: AvayaAgentData) {
  const ascDaily = agent.daily && Object.keys(agent.daily).length ? agent.daily : dailyFromRecent(agent);
  const days = [...new Set([...Object.keys(ascDaily), ...Object.keys(avaya?.daily ?? {})])].sort((a, b) => a.localeCompare(b));
  return days.map((day) => {
    const asc = ascDaily[day];
    const phone = avaya?.daily?.[day];
    return {
      day,
      ascCount: asc?.attendanceCount ?? 0,
      avayaCount: phone?.callCount ?? 0,
      total: (asc?.attendanceCount ?? 0) + (phone?.callCount ?? 0),
      ascTma: asc?.averageSeconds ?? 0,
      ascTmpa: asc?.averageFirstResponseSeconds ?? 0,
      ascLogged: asc?.loggedSeconds ?? 0,
      ascPaused: asc?.pausedSeconds ?? 0,
      ascPauseCount: asc?.pauseCount ?? 0,
      ascPauseTypes: asc?.pauseTypes ?? {},
      avayaMissed: phone?.missedCalls ?? 0,
      avayaAbandoned: phone?.abandonedCalls ?? 0,
      avayaTransferred: phone?.transferredCalls ?? 0,
    };
  });
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

function daysInDashboard(dashboard: DashboardData) {
  const match = dashboardPeriodKey(dashboard).match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 30;
}

function activityNames(dashboard: DashboardData) {
  const active = Object.entries(dashboard.agents)
    .filter(([name]) => !indicatorExcludedAgents.has(name))
    .filter(([, data]) => data.attendanceCount > 0 || data.ratingTotal > 0)
    .map(([name]) => name);
  return active.length ? active : Object.keys(dashboard.agents).filter((name) => !indicatorExcludedAgents.has(name));
}

function teamMetrics(dashboard: DashboardData) {
  const agents = Object.entries(dashboard.agents).filter(([name]) => !indicatorExcludedAgents.has(name)).map(([, agent]) => agent);
  const ratings = ratingOrder.reduce<Record<RatingName, number>>((result, rating) => {
    result[rating] = agents.reduce((sum, agent) => sum + agent.ratings[rating], 0);
    return result;
  }, { Ruim: 0, Regular: 0, Bom: 0, "Ótimo": 0 });
  const attendanceCount = agents.reduce((sum, agent) => sum + agent.attendanceCount, 0);
  const completedCount = agents.reduce((sum, agent) => sum + agent.completedCount, 0);
  const timedCount = agents.reduce((sum, agent) => sum + agent.timedCount, 0);
  const totalSeconds = agents.reduce((sum, agent) => sum + agent.totalSeconds, 0);
  const firstResponseCount = agents.reduce((sum, agent) => sum + (agent.firstResponseCount ?? 0), 0);
  const firstResponseTotal = agents.reduce((sum, agent) => sum + ((agent.averageFirstResponseSeconds ?? 0) * (agent.firstResponseCount ?? 0)), 0);
  const ratingTotal = ratingOrder.reduce((sum, rating) => sum + ratings[rating], 0);
  const positive = ratings.Bom + ratings["Ótimo"];
  const serviceTotals = new Map<string, number>();
  agents.forEach((agent) => agent.topServices.forEach(([service, count]) => serviceTotals.set(service, (serviceTotals.get(service) ?? 0) + count)));
  return {
    attendanceCount, completedCount, timedCount, totalSeconds, firstResponseCount, firstResponseTotal, ratings, ratingTotal, positive,
    averageSeconds: timedCount ? Math.round(totalSeconds / timedCount) : 0,
    averageFirstResponseSeconds: firstResponseCount ? Math.round(firstResponseTotal / firstResponseCount) : 0,
    engagement: attendanceCount ? (ratingTotal / attendanceCount) * 100 : 0,
    csat: ratingTotal ? (positive / ratingTotal) * 100 : 0,
    topServices: [...serviceTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) as Array<[string, number]>,
  };
}

function SatisfactionDonut({ data }: { data: Pick<AgentData, "ratingTotal" | "ratings" | "csat"> }) {
  let cursor = 0;
  const stops = ratingOrder.map((rating) => {
    const start = cursor;
    cursor += data.ratingTotal ? (data.ratings[rating] / data.ratingTotal) * 100 : 0;
    return `${ratingColors[rating]} ${start}% ${cursor}%`;
  });
  return <div className="donut-wrap">
    <div className="donut" style={{ background: data.ratingTotal ? `conic-gradient(${stops.join(",")})` : "#e9eef4" }} role="img" aria-label={`CSAT de ${formatPercent(data.csat)} em ${data.ratingTotal} avaliações`}>
      <div className="donut-center"><strong>{formatPercent(data.csat)}</strong><span>CSAT</span></div>
    </div>
    <p>{data.ratingTotal} avaliações recebidas</p>
  </div>;
}

function KpiCard({ icon, tone, title, value, children, onOpen }: { icon: string; tone: string; title: string; value: string | number; children: ReactNode; onOpen?: () => void }) {
  return <article className={`kpi-card ${tone}`}>
    <div className={`kpi-icon ${tone}`}>{icon}</div>
    <div><p>{title}</p><strong>{value}</strong></div>
    {onOpen ? <button type="button" className="kpi-more-trigger" aria-label={`Ver detalhes de ${title}`} title="Ver detalhes" onClick={onOpen}>+</button> : <details className="kpi-more">
      <summary aria-label={`Ver detalhes de ${title}`} title="Ver detalhes">+</summary>
      <div>{children}</div>
    </details>}
  </article>;
}

function pauseTypesLabel(types: Record<string, number>) {
  const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([type, count]) => `${type.trim()}: ${count}`).join(" · ") : "Sem pausas registradas";
}

function AgentSelector({ names, activeName, dashboard, onChange }: { names: string[]; activeName: string; dashboard: DashboardData; onChange: (name: string) => void }) {
  return <div className="agent-tabs" role="tablist" aria-label="Escolha o agente">
    {names.map((name) => <button key={name} className={name === activeName ? "agent-tab active" : "agent-tab"} onClick={() => onChange(name)} role="tab" aria-selected={name === activeName}>
      <span className="avatar">{initials(name)}</span>
      <span>{name}<small>{dashboard.agents[name].attendanceCount} atendimentos</small></span>
    </button>)}
  </div>;
}

function RatingDistribution({ ratings, total, data }: { ratings: Record<RatingName, number>; total: number; data: Pick<AgentData, "ratingTotal" | "ratings" | "csat"> }) {
  return <article className="panel ratings-panel">
    <div className="panel-heading"><div><p className="eyebrow">Experiência do cliente</p><h3>Distribuição das avaliações</h3></div><span className="info-badge" title="CSAT considera avaliações Bom e Ótimo">i</span></div>
    <div className="rating-content"><SatisfactionDonut data={data} /><div className="rating-list">
      {ratingOrder.map((rating) => {
        const percentage = total ? Math.round((ratings[rating] / total) * 100) : 0;
        return <div className="rating-row" key={rating}><div className="rating-label"><i style={{ background: ratingColors[rating] }} /><span>{rating}</span><strong>{ratings[rating]}</strong></div><div className="rating-track"><span style={{ width: `${percentage}%`, background: ratingColors[rating] }} /></div><small>{percentage}%</small></div>;
      })}
    </div></div>
  </article>;
}

function ServicesPanel({ services }: { services: Array<[string, number]> }) {
  const visibleServices = services.slice(0, 5);
  const maximum = Math.max(...visibleServices.map((item) => item[1]), 1);
  return <article className="panel services-panel"><div className="panel-heading"><div><p className="eyebrow">Demanda</p><h3>Principais motivos de contato</h3></div><span className="count-badge">Top 5</span></div><div className="service-list">
    {visibleServices.map(([service, count], index) => <div className="service-row" key={service}><span className="service-rank">{String(index + 1).padStart(2, "0")}</span><div><div className="service-name"><span>{service.replace("Devoluções - ", "")}</span><strong>{count}</strong></div><div className="service-track"><span style={{ width: `${(count / maximum) * 100}%` }} /></div></div></div>)}
    {!visibleServices.length ? <p className="empty-state">Nenhum motivo de contato disponível.</p> : null}
  </div></article>;
}

function ImportPanel({ team, onUpdated }: { team: TeamName; onUpdated: (dashboard: DashboardData) => void }) {
  const today = new Date();
  const [files, setFiles] = useState<File[]>([]);
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function importReports() {
    if (!files.length) return setMessage({ tone: "error", text: "Selecione pelo menos um relatório antes de atualizar." });
    setBusy(true); setMessage(null);
    try {
      const dashboard = await processReportFiles(files, { year, month }, team);
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dashboard }) });
      const result = await response.json() as { dashboard?: DashboardData; error?: string };
      if (!response.ok || !result.dashboard) throw new Error(result.error || "Não foi possível salvar a atualização.");
      onUpdated(result.dashboard);
      setMessage({ tone: "success", text: `${team} · ${result.dashboard.meta.period} atualizado com sucesso.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao importar os relatórios." });
    } finally { setBusy(false); }
  }
  return <section className="panel import-panel" aria-labelledby="import-title"><div className="import-copy"><span className="import-icon" aria-hidden="true">⇧</span><div><p className="eyebrow">Atualização mensal</p><h2 id="import-title">Uploads de relatórios</h2><p>Os arquivos serão salvos em <strong>{team}</strong>. Escolha a competência e selecione os relatórios disponíveis.</p></div></div><div className="import-actions">
    <div className="period-selectors"><label className="period-field"><span>Mês</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label><label className="period-field"><span>Ano</span><input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label></div>
    <label className="file-picker"><input type="file" multiple accept=".xlsx,.xls,.csv,.tsv" onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setMessage(null); }} /><span>{files.length ? `${files.length} arquivos selecionados` : "Selecionar arquivos"}</span><small>XLSX, XLS, CSV ou TSV</small></label>
    {files.length ? <div className="selected-files">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div> : null}
    <button className="import-button" type="button" onClick={importReports} disabled={busy || !files.length}>{busy ? "Processando relatórios…" : `Atualizar ${team}`}</button>
    {message ? <p className={`import-message ${message.tone}`} role="status">{message.text}</p> : null}
  </div></section>;
}

function AvayaAgentDetails({ name, data, period, hasPauseData, hasLoggedData, onClose }: { name: string; data: AvayaAgentData; period: string; hasPauseData: boolean; hasLoggedData: boolean; onClose: () => void }) {
  const days = Object.entries(data.daily).sort(([a], [b]) => a.localeCompare(b));
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="avaya-detail-title">
    <section className="modal-card avaya-modal">
      <div className="modal-heading">
        <div><p className="eyebrow">Detalhes por dia</p><h2 id="avaya-detail-title">{name}</h2><p>Informações Avaya em {period.toLowerCase()}.</p></div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar detalhes">×</button>
      </div>
      <div className="table-wrap avaya-table-wrap"><table className="avaya-table"><thead><tr><th>Dia</th><th>Chamadas</th><th>Perdidas</th><th>Abandonadas</th><th>Transferidas</th><th>Pausas</th><th>T. pausa</th><th>T. logado</th></tr></thead><tbody>
        {days.map(([day, item]) => <tr key={day}><td><strong>{formatDateLabel(day)}</strong></td><td>{item.callCount}</td><td>{item.missedCalls}</td><td>{item.abandonedCalls}</td><td>{item.transferredCalls}</td><td>{hasPauseData ? item.pauseCount : "—"}</td><td>{formatMaybeDuration(item.averagePauseSeconds, hasPauseData)}</td><td>{formatMaybeDuration(item.averageLoggedSeconds, hasLoggedData)}</td></tr>)}
      </tbody></table>{!days.length ? <p className="empty-state">Nenhuma chamada Avaya para este agente no período.</p> : null}</div>
    </section>
  </div>;
}

function ProductivityDetails({ name, rows, onClose }: { name: string; rows: ReturnType<typeof agentProductivityRows>; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="productivity-detail-title">
    <section className="modal-card productivity-modal">
      <div className="modal-heading">
        <div><p className="eyebrow">Detalhes por dia</p><h2 id="productivity-detail-title">Produtividade diária · {name}</h2><p>Quebra diária do total mensal apresentado no card de produtividade.</p></div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar detalhes">×</button>
      </div>
      <div className="table-wrap avaya-table-wrap"><table><thead><tr><th>Dia</th><th>Atendimentos ASC</th><th>Chamadas 0800</th><th>Total produtivo</th><th>Logado ASC</th><th>Pausado ASC</th><th>Pausas ASC</th><th>TMA ASC</th><th>TMPA ASC</th><th>Perdidas</th><th>Abandonadas</th><th>Transferidas</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.day}><td><strong>{formatDateLabel(row.day)}</strong></td><td>{row.ascCount}</td><td>{row.avayaCount}</td><td><strong>{row.total}</strong></td><td>{formatDuration(row.ascLogged, true)}</td><td>{formatDuration(row.ascPaused, true)}</td><td>{row.ascPauseCount ? pauseTypesLabel(row.ascPauseTypes) : "—"}</td><td>{formatDuration(row.ascTma)}</td><td>{formatDuration(row.ascTmpa)}</td><td>{row.avayaMissed}</td><td>{row.avayaAbandoned}</td><td>{row.avayaTransferred}</td></tr>)}
      </tbody></table>{!rows.length ? <p className="empty-state">Nenhum detalhe diário disponível para este agente.</p> : null}</div>
    </section>
  </div>;
}

function AttendanceDetails({ name, calls, onClose }: { name: string; calls: RecentCall[]; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="attendance-detail-title">
    <section className="modal-card attendance-modal">
      <div className="modal-heading">
        <div><p className="eyebrow">Protocolos do ASC</p><h2 id="attendance-detail-title">Atendimentos · {name}</h2><p>Todos os atendimentos do mês, com protocolo, data, status e tempos principais.</p></div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar detalhes">×</button>
      </div>
      <div className="table-wrap avaya-table-wrap"><table className="attendance-table"><thead><tr><th>Protocolo</th><th>Data e hora</th><th>Motivo</th><th>Status</th><th>TMA</th><th>TMPA</th><th>Fila</th></tr></thead><tbody>
        {calls.map((call, index) => <tr key={`${call.protocol}-${call.date}-${index}`}><td><strong>{call.protocol}</strong></td><td>{call.date.slice(0, 16)}</td><td>{call.service.replace("Devoluções - ", "")}</td><td><span className={`table-status ${call.finished ? "done" : "open"}`}>{call.status}</span></td><td>{call.finished ? formatDuration(call.seconds) : "Em curso"}</td><td>{typeof call.firstResponseSeconds === "number" ? formatDuration(call.firstResponseSeconds) : "—"}</td><td>{formatDuration(call.queueSeconds)}</td></tr>)}
      </tbody></table>{!calls.length ? <p className="empty-state">Nenhum atendimento disponível para este agente.</p> : null}</div>
    </section>
  </div>;
}

function SurveyDetails({ name, data, filter, onFilterChange, onClose }: { name: string; data: AgentData; filter: RatingFilter; onFilterChange: (filter: RatingFilter) => void; onClose: () => void }) {
  const surveys = filter === "Todas" ? data.surveyDetails : data.surveyDetails.filter((survey) => survey.rating === filter);
  const engagement = data.attendanceCount ? (data.ratingTotal / data.attendanceCount) * 100 : 0;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="survey-detail-title">
    <section className="modal-card survey-modal">
      <div className="modal-heading">
        <div><p className="eyebrow">Avaliações do ASC</p><h2 id="survey-detail-title">Notas por protocolo · {name}</h2><p>{formatPercent(engagement)} de engajamento das notas no mês.</p></div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar detalhes">×</button>
      </div>
      <div className="rating-filters">
        {(["Todas", ...ratingOrder] as RatingFilter[]).map((item) => <button key={item} type="button" className={filter === item ? `rating-filter active ${item.toLowerCase()}` : "rating-filter"} onClick={() => onFilterChange(item)}>{item} <strong>{item === "Todas" ? data.ratingTotal : data.ratings[item]}</strong></button>)}
      </div>
      <div className="table-wrap survey-table-wrap"><table className="survey-table"><thead><tr><th>Protocolo</th><th>Nota do cliente</th><th>Data da avaliação</th><th>Motivo do contato</th><th>Canal</th></tr></thead><tbody>{surveys.map((survey) => <tr key={`${survey.protocol}-${survey.date}`}><td><strong>{survey.protocol}</strong></td><td><span className={`rating-pill ${survey.rating.toLowerCase()}`}><i />{survey.rating}</span></td><td>{survey.date.slice(0, 16)}</td><td>{survey.service.replace("Devoluções - ", "")}</td><td>{survey.channel}</td></tr>)}</tbody></table>{!surveys.length ? <p className="empty-state">Nenhum protocolo recebeu esta nota no período.</p> : null}</div>
    </section>
  </div>;
}

function LoggedComparisonPanel({ rows, team }: { rows: ReturnType<typeof loggedComparisonRows>; team: TeamName }) {
  return <section className="panel table-panel logged-comparison-panel"><div className="panel-heading"><div><p className="eyebrow">Disparidade operacional</p><h3>Tempo logado ASC x 0800 · {team.replace("Time ", "")}</h3><span className="panel-subtitle">Controle para identificar diferença de tempo logado entre sistemas por agente.</span></div><span className="count-badge">Pronto para importação</span></div><div className="table-wrap"><table><thead><tr><th>Agente</th><th>Logado ASC</th><th>Logado 0800</th><th>Diferença</th><th>Disparidade</th><th>Status</th></tr></thead><tbody>
    {rows.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{formatMaybeDuration(row.ascSeconds, row.hasAsc)}</td><td>{formatMaybeDuration(row.avayaSeconds, row.hasAvaya)}</td><td>{formatMaybeDuration(row.diff, row.hasAsc && row.hasAvaya)}</td><td>{row.hasAsc && row.hasAvaya ? formatPercent(row.disparity) : "—"}</td><td><span className={`logged-status ${row.status}`}>{row.label}</span></td></tr>)}
  </tbody></table></div></section>;
}

function LeadershipPanel({ dashboard, avayaDashboard, userRole, userName }: { dashboard: DashboardData; avayaDashboard: AvayaDashboardData; userRole: DashboardUserRole; userName: string }) {
  const visibleGroups = userRole === "coordinator" ? leaderGroups : leaderGroups.filter((group) => group.leader === userName);
  if (!visibleGroups.length) return null;
  return <section className="panel leadership-panel">
    <div className="panel-heading"><div><p className="eyebrow">{userRole === "coordinator" ? "Coordenação" : "Liderança"}</p><h3>{userRole === "coordinator" ? "Visão por líder" : "Meu time"}</h3><span className="panel-subtitle">Líderes e respectivos liderados acompanhados no painel.</span></div><span className="count-badge">{visibleGroups.length} {visibleGroups.length === 1 ? "líder" : "líderes"}</span></div>
    <div className="leadership-grid">
      {visibleGroups.map((group) => {
        const agents = group.agents.filter((name) => dashboard.agents[name]);
        const metrics = aggregateAgents(dashboard, agents);
        const avaya = aggregateAvayaAgents(agents.map((name) => avayaDashboard.agents[name]).filter(Boolean));
        const hasAgents = agents.length > 0;
        return <article className="leader-card" key={group.leader}>
          <div className="leader-card-head"><span className="avatar">{initials(group.leader)}</span><div><p>{group.roleLabel}</p><h4>{group.leader}</h4><small>{hasAgents ? agents.join(", ") : "Sem time parametrizado por enquanto."}</small></div></div>
          {hasAgents ? <div className="leader-metrics"><span><b>{metrics.attendanceCount}</b> ASC</span><span><b>{avaya.callCount}</b> Avaya</span><span><b>{metrics.attendanceCount + avaya.callCount}</b> total</span><span><b>{formatPercent(metrics.engagement)}</b> engaj.</span></div> : <p className="leader-empty">Indicadores ainda não parametrizados para esta liderança.</p>}
        </article>;
      })}
    </div>
  </section>;
}

function CoordinatorLeaderPicker({ onSelect }: { onSelect: (leader: string) => void }) {
  return <section className="coordinator-home view-page">
    <div className="coordinator-hero panel">
      <p className="eyebrow">Coordenação</p>
      <h2>Olá! Quais indicadores você gostaria de acompanhar agora?</h2>
      <p>Escolha uma liderança para abrir a visão de indicadores da carteira correspondente. Você pode voltar e trocar de liderança quando quiser.</p>
    </div>
    <div className="coordinator-leaders">
      {leaderGroups.map((group) => {
        const hasAgents = group.agents.length > 0;
        return <button type="button" className={hasAgents ? "coordinator-leader-card" : "coordinator-leader-card inactive"} key={group.leader} onClick={() => onSelect(group.leader)}>
          <span className="avatar">{initials(group.leader)}</span>
          <span><small>{group.roleLabel}</small><strong>{group.leader}</strong><em>{hasAgents ? `${group.agents.length} liderados parametrizados` : "Sem indicadores parametrizados"}</em></span>
          <i aria-hidden="true">→</i>
        </button>;
      })}
    </div>
  </section>;
}

export default function Dashboard({ userName, userRole, hasFullAccess, initialDashboards: initialDashboardData, avayaDashboard }: { userName: string; userRole: DashboardUserRole; hasFullAccess: boolean; initialDashboards: DashboardData[]; avayaDashboard: AvayaDashboardData }) {
  const initialDashboards = useMemo(() => mergeDashboards(initialDashboardData.map(normalizeDashboardData)), [initialDashboardData]);
  const initial = initialDashboards.find((dashboard) => dashboardTeam(dashboard) === "Time Fornecimento") ?? initialDashboards[0];
  const initialTeam = initial ? dashboardTeam(initial) : "Time Fornecimento";
  const [availableDashboards, setAvailableDashboards] = useState<DashboardData[]>(initialDashboards);
  const [selectedTeam, setSelectedTeam] = useState<TeamName>(initialTeam);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(initial ? dashboardPeriodKey(initial) : "2026-07");
  const [activeView, setActiveView] = useState<ViewName>("overview");
  const [activeName, setActiveName] = useState(userName);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("Todas");
  const [avayaDetailName, setAvayaDetailName] = useState<string | null>(null);
  const [productivityDetailOpen, setProductivityDetailOpen] = useState(false);
  const [attendanceDetailOpen, setAttendanceDetailOpen] = useState(false);
  const [surveyDetailOpen, setSurveyDetailOpen] = useState(false);
  const [selectedLeaderName, setSelectedLeaderName] = useState<string | null>(userRole === "leader" && hasFullAccess ? userName : null);
  const visibleTeams = useMemo(() => teams.filter((team) => availableDashboards.some((dashboard) => dashboardTeam(dashboard) === team)), [availableDashboards]);
  const teamDashboards = useMemo(() => sortDashboards(availableDashboards.filter((dashboard) => dashboardTeam(dashboard) === selectedTeam)), [availableDashboards, selectedTeam]);
  const currentDashboard = teamDashboards.find((dashboard) => dashboardPeriodKey(dashboard) === selectedPeriodKey) ?? teamDashboards[teamDashboards.length - 1] ?? null;
  const selectedLeaderGroup = selectedLeaderName ? leaderGroups.find((group) => group.leader === selectedLeaderName) ?? null : null;
  const isChoosingLeader = hasFullAccess && userRole === "coordinator" && !selectedLeaderGroup;
  const scopedDashboard = currentDashboard && selectedLeaderGroup ? scopeDashboardToAgents(currentDashboard, selectedLeaderGroup.agents) : currentDashboard;

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard").then((response) => response.ok ? response.json() : null).then((result: { dashboard?: DashboardData | null; dashboards?: DashboardData[] } | null) => {
      if (!active || !result?.dashboard) return;
      const loaded = mergeDashboards([...initialDashboards, ...(result.dashboards?.length ? result.dashboards : [result.dashboard]).map(normalizeDashboardData)]);
      setAvailableDashboards(loaded);
      const selected = loaded.filter((dashboard) => dashboardTeam(dashboard) === selectedTeam);
      if (selected.length) setSelectedPeriodKey(dashboardPeriodKey(selected[selected.length - 1]));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const names = scopedDashboard ? activityNames(scopedDashboard) : [];
  const userDataName = displayToDataAgentName[userName] ?? userName;
  useEffect(() => {
    if (names.length && !names.includes(activeName)) setActiveName(names.includes(userDataName) ? userDataName : names[0]);
  }, [activeName, names.join("|"), userDataName]);

  function chooseTeam(team: TeamName) {
    if (!visibleTeams.includes(team)) return;
    setSelectedTeam(team);
    const dashboards = sortDashboards(availableDashboards.filter((dashboard) => dashboardTeam(dashboard) === team));
    if (dashboards.length) setSelectedPeriodKey(dashboardPeriodKey(dashboards[dashboards.length - 1]));
    setRatingFilter("Todas");
  }

  function updateDashboard(next: DashboardData) {
    if (!hasFullAccess) return;
    const normalized = normalizeDashboardData(next);
    setAvailableDashboards((current) => mergeDashboards([...current, normalized]));
    setSelectedTeam(dashboardTeam(normalized));
    setSelectedPeriodKey(dashboardPeriodKey(normalized));
    setRatingFilter("Todas");
  }

  const currentPeriodIndex = currentDashboard ? teamDashboards.findIndex((dashboard) => dashboardPeriodKey(dashboard) === dashboardPeriodKey(currentDashboard)) : -1;
  function goToPeriod(offset: number) {
    const next = teamDashboards[currentPeriodIndex + offset];
    if (next) { setSelectedPeriodKey(dashboardPeriodKey(next)); setRatingFilter("Todas"); }
  }

  const firstName = userName.split(" ")[0];
  const metrics = scopedDashboard ? teamMetrics(scopedDashboard) : null;
  const data = scopedDashboard ? (scopedDashboard.agents[activeName] ?? scopedDashboard.agents[names[0]]) : null;
  const days = scopedDashboard ? daysInDashboard(scopedDashboard) : 0;
  const agentEngagement = data?.attendanceCount ? (data.ratingTotal / data.attendanceCount) * 100 : 0;
  const fallbackFinished = data?.recent.filter((call) => call.finished && call.seconds > 0).map((call) => call.seconds) ?? [];
  const fallbackFirst = data?.recent.map((call) => call.firstResponseSeconds).filter((value): value is number => typeof value === "number") ?? [];
  const minTma = data?.minSeconds ?? (fallbackFinished.length ? Math.min(...fallbackFinished) : 0);
  const maxTma = data?.maxSeconds ?? (fallbackFinished.length ? Math.max(...fallbackFinished) : 0);
  const minTmpa = data?.minFirstResponseSeconds ?? (fallbackFirst.length ? Math.min(...fallbackFirst) : 0);
  const maxTmpa = data?.maxFirstResponseSeconds ?? (fallbackFirst.length ? Math.max(...fallbackFirst) : 0);
  const avayaDetailData = avayaDetailName ? avayaDashboard.agents[avayaDetailName] : null;
  const avayaAgentNames = hasFullAccess ? avayaNamesForContext(avayaDashboard, selectedTeam, selectedLeaderGroup) : [userDataName].filter((name) => avayaDashboard.agents[name]);
  const avayaTeamData = aggregateAvayaAgents(avayaAgentNames.map((name) => avayaDashboard.agents[name]).filter(Boolean));
  const loggedRows = loggedComparisonRows(avayaDashboard, avayaAgentNames, scopedDashboard);
  const avayaAgentData = avayaDashboard.agents[activeName];
  const productivityRows = data ? agentProductivityRows(data, avayaAgentData) : [];
  const productivityTotal = data ? data.attendanceCount + (avayaAgentData?.callCount ?? 0) : 0;
  const pauseSummary = Object.entries(avayaTeamData.pauseTypes);
  const roleLabel = userRole === "coordinator" ? "Coordenação" : userRole === "leader" ? "Líder" : "Agente";

  const menu = ([
    { view: "overview", icon: "⌂", label: "Visão Geral" }, { view: "agents", icon: "◎", label: "Visão Agente" }, { view: "avaya", icon: "☎", label: "Avaya" }, { view: "uploads", icon: "⇧", label: "Uploads" },
  ] satisfies Array<{ view: ViewName; icon: string; label: string }>).filter((item) => hasFullAccess || item.view !== "uploads");

  return <main className="dashboard-shell"><aside className="sidebar"><button className="sidebar-brand brand-button" onClick={() => setActiveView("overview")} aria-label="Abrir visão geral"><img src="/autoglass-logo-oficial.png" alt="Autoglass" width={132} height={40} /><span>PÓS-VENDAS</span></button><nav aria-label="Navegação principal">
    {menu.map((item) => <button key={item.view} className={activeView === item.view ? "nav-item active" : "nav-item"} onClick={() => setActiveView(item.view)}><span>{item.icon}</span>{item.label}</button>)}
  </nav>
    <div className="sidebar-foot"><p>Competência</p><strong>{currentDashboard?.meta.period ?? "Sem dados"}</strong><span>{selectedTeam}</span></div>
  </aside><section className="dashboard-main"><header className="topbar"><div><p className="eyebrow">Painel de indicadores</p><h1>Olá, {firstName}</h1></div><div className="topbar-actions">
    {hasFullAccess && userRole === "coordinator" && selectedLeaderGroup ? <button type="button" className="detail-button" onClick={() => { setSelectedLeaderName(null); setActiveView("overview"); }}>Trocar liderança</button> : null}
    {hasFullAccess && visibleTeams.length > 1 ? <div className="team-switcher" role="group" aria-label="Selecionar time"><div className="team-options">{visibleTeams.map((team) => <button key={team} type="button" className={selectedTeam === team ? "active" : ""} aria-pressed={selectedTeam === team} onClick={() => chooseTeam(team)}>{team.replace("Time ", "")}</button>)}</div></div> : null}
    <div className="period-navigator"><button type="button" className="period-arrow" onClick={() => goToPeriod(-1)} disabled={currentPeriodIndex <= 0}>‹</button><span className="period-chip">◷ {currentDashboard?.meta.period ?? "Sem competência"}</span><button type="button" className="period-arrow" onClick={() => goToPeriod(1)} disabled={currentPeriodIndex < 0 || currentPeriodIndex >= teamDashboards.length - 1}>›</button></div><LogoutButton userName={userName} roleLabel={roleLabel} />
  </div></header>

  {!currentDashboard && activeView !== "uploads" ? <section className="empty-team panel"><span>◎</span><h2>Ainda não há dados para {selectedTeam}</h2><p>Abra Uploads, mantenha este time selecionado e importe os dois relatórios do período.</p><button type="button" onClick={() => setActiveView("uploads")}>Ir para Uploads</button></section> : null}

  {isChoosingLeader ? <CoordinatorLeaderPicker onSelect={(leader) => { setSelectedLeaderName(leader); setActiveView("overview"); }} /> : null}

  {!isChoosingLeader && currentDashboard && selectedLeaderGroup && !selectedLeaderGroup.agents.length && activeView !== "uploads" ? <section className="empty-team panel"><span>◇</span><h2>{selectedLeaderGroup.leader} ainda não tem indicadores parametrizados</h2><p>Essa liderança já está disponível para a Milena selecionar, mas ainda não definimos o time e os indicadores dela.</p><button type="button" onClick={() => setSelectedLeaderName(null)}>Voltar para lideranças</button></section> : null}

  {!isChoosingLeader && scopedDashboard && metrics && activeView === "overview" && (!selectedLeaderGroup || selectedLeaderGroup.agents.length > 0) ? <section className="view-page"><div className="page-heading"><div><p className="eyebrow">Resultado consolidado</p><h2>Visão Geral</h2><p>Indicadores macro de {selectedLeaderGroup ? `${selectedLeaderGroup.leader} · ` : ""}{selectedTeam} em {scopedDashboard.meta.period.toLowerCase()}.</p></div><span className="status-pill"><i /> Dados atualizados</span></div><section className="kpi-grid">
    <KpiCard icon="◷" tone="primary" title="Tempo médio de atendimento" value={formatDuration(metrics.averageSeconds)}><p><strong>Cálculo</strong></p><p>{formatDuration(metrics.totalSeconds, true)} ÷ {metrics.timedCount} atendimentos com tempo = <b>{formatDuration(metrics.averageSeconds)}</b></p></KpiCard>
    <KpiCard icon="↯" tone="first-response" title="Tempo médio do primeiro atendimento" value={formatDuration(metrics.averageFirstResponseSeconds)}><p><strong>Cálculo</strong></p><p>{formatDuration(metrics.firstResponseTotal, true)} ÷ {metrics.firstResponseCount} primeiros atendimentos = <b>{formatDuration(metrics.averageFirstResponseSeconds)}</b></p></KpiCard>
    <KpiCard icon="★" tone="engagement" title="% de engajamento das notas" value={formatPercent(metrics.engagement)}><p><strong>Número exato</strong></p><p>{metrics.ratingTotal} notas ÷ {metrics.attendanceCount} atendimentos × 100 = <b>{formatPercent(metrics.engagement)}</b></p></KpiCard>
    <KpiCard icon="◎" tone="attendance-total" title="Quantidade de atendimentos" value={metrics.attendanceCount}><p><strong>Média por dia</strong></p><p>{metrics.attendanceCount} ÷ {days} dias = <b>{(metrics.attendanceCount / days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} atendimentos/dia</b></p></KpiCard>
    <KpiCard icon="☎" tone="sky" title="Ligações atendidas" value={avayaTeamData.answeredCalls}><p><strong>0800 · {selectedTeam.replace("Time ", "")}</strong></p><p>{avayaTeamData.answeredCalls} ligações atendidas de {avayaTeamData.callCount} chamadas totais no período.</p></KpiCard>
  </section><section className="charts-grid"><RatingDistribution ratings={metrics.ratings} total={metrics.ratingTotal} data={{ ratingTotal: metrics.ratingTotal, ratings: metrics.ratings, csat: metrics.csat }} /><ServicesPanel services={metrics.topServices} /></section><LoggedComparisonPanel rows={loggedRows} team={selectedTeam} />{hasFullAccess && !selectedLeaderGroup ? <LeadershipPanel dashboard={scopedDashboard} avayaDashboard={avayaDashboard} userRole={userRole} userName={userName} /> : null}</section> : null}

  {!isChoosingLeader && scopedDashboard && data && activeView === "agents" ? <section className="view-page"><div className="page-heading"><div><p className="eyebrow">Desempenho individual</p><h2>Visão Agente</h2><p>Todos os indicadores exclusivos de cada agente.</p></div></div><AgentSelector names={names} activeName={activeName} dashboard={scopedDashboard} onChange={(name) => { setActiveName(name); setRatingFilter("Todas"); }} /><div className="profile-heading compact"><div><h2>{activeName}</h2><p>{selectedLeaderGroup ? `${selectedLeaderGroup.leader} · ` : ""}{selectedTeam} · {scopedDashboard.meta.period}</p></div></div><section className="kpi-grid">
    <KpiCard icon="◷" tone="primary" title="Tempo médio de atendimento" value={formatDuration(data.averageSeconds)}><div className="sla-range"><span>Menor SLA <b>{formatDuration(minTma)}</b></span><span>Maior SLA <b>{formatDuration(maxTma)}</b></span></div></KpiCard>
    <KpiCard icon="↯" tone="first-response" title="Tempo médio do primeiro atendimento" value={formatDuration(data.averageFirstResponseSeconds)}><div className="sla-range"><span>Menor SLA <b>{formatDuration(minTmpa)}</b></span><span>Maior SLA <b>{formatDuration(maxTmpa)}</b></span></div></KpiCard>
    <KpiCard icon="★" tone="engagement" title="% de engajamento das notas" value={formatPercent(agentEngagement)} onOpen={() => { setRatingFilter("Todas"); setSurveyDetailOpen(true); }}><p><strong>Número exato</strong></p><p>{data.ratingTotal} notas ÷ {data.attendanceCount} atendimentos × 100 = <b>{formatPercent(agentEngagement)}</b></p></KpiCard>
    <KpiCard icon="◎" tone="attendance-total" title="Quantidade de atendimentos" value={data.attendanceCount} onOpen={() => setAttendanceDetailOpen(true)}><p><strong>Média por dia</strong></p><p>{data.attendanceCount} ÷ {days} dias = <b>{(data.attendanceCount / days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} atendimentos/dia</b></p></KpiCard>
  </section><section className="charts-grid"><RatingDistribution ratings={data.ratings} total={data.ratingTotal} data={data} /><ServicesPanel services={data.topServices} /></section>
    <section className="panel asc-agent-panel"><div className="panel-heading"><div><p className="eyebrow">ASC</p><h3>Operação do ASC · {activeName}</h3><span className="panel-subtitle">Tempo logado, tempo pausado e tipos de pausa no mês.</span></div></div><div className="avaya-agent-grid">
      <KpiCard icon="⌁" tone="primary" title="Tempo logado ASC" value={formatDuration(data.loggedSeconds ?? 0, true)}><p>Total logado no ASC em {scopedDashboard.meta.period.toLowerCase()}.</p></KpiCard>
      <KpiCard icon="Ⅱ" tone="attendance-total" title="Tempo pausado ASC" value={formatDuration(data.pausedSeconds ?? 0, true)}><p>Total pausado no ASC em {scopedDashboard.meta.period.toLowerCase()}.</p></KpiCard>
      <KpiCard icon="☰" tone="engagement" title="Pausas registradas" value={data.pauseCount ?? 0}>{Object.entries(data.pauseTypes ?? {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => <p key={type}>{type.trim()}: <b>{count}</b></p>)}{!Object.keys(data.pauseTypes ?? {}).length ? <p>Nenhuma pausa registrada no período.</p> : null}</KpiCard>
    </div></section>
    {avayaAgentData ? <section className="panel avaya-agent-panel"><div className="panel-heading"><div><p className="eyebrow">0800</p><h3>Avaya · {activeName}</h3><span className="panel-subtitle">Resumo macro do agente no período.</span></div><button type="button" className="detail-button" onClick={() => setAvayaDetailName(activeName)}>Ver detalhes</button></div><div className="avaya-agent-grid">
      <KpiCard icon="☎" tone="primary" title="Quantidade de chamadas" value={avayaAgentData.callCount}><p>{avayaAgentData.answeredCalls} atendidas no período.</p></KpiCard>
      <KpiCard icon="!" tone="orange" title="Chamadas perdidas" value={avayaAgentData.missedCalls}><p>Chamadas não atendidas pelo fluxo mapeado do Avaya.</p></KpiCard>
      <KpiCard icon="↘" tone="first-response" title="Chamadas abandonadas" value={avayaAgentData.abandonedCalls}><p>Clientes que saíram antes do atendimento.</p></KpiCard>
      <KpiCard icon="⇄" tone="sky" title="Chamadas transferidas" value={avayaAgentData.transferredCalls}><p>Registros marcados como transferência no arquivo.</p></KpiCard>
      <KpiCard icon="Ⅱ" tone="engagement" title="Tipos de pausas" value={avayaDashboard.meta.hasPauseData ? avayaAgentData.pauseCount : "—"}><p>{avayaDashboard.meta.hasPauseData ? "Pausas consolidadas para o agente." : "Este arquivo Avaya não contém dados de pausa."}</p></KpiCard>
      <KpiCard icon="◷" tone="attendance-total" title="Tempo médio em pausa" value={formatMaybeDuration(avayaAgentData.averagePauseSeconds, avayaDashboard.meta.hasPauseData)}><p>{avayaDashboard.meta.hasPauseData ? "Média das pausas do agente." : "Aguardando relatório com duração de pausas."}</p></KpiCard>
      <KpiCard icon="⌁" tone="primary" title="Tempo médio logado" value={formatMaybeDuration(avayaAgentData.averageLoggedSeconds, avayaDashboard.meta.hasLoggedData)}><p>{avayaDashboard.meta.hasLoggedData ? "Média de tempo logado do agente." : "Aguardando relatório com tempo logado."}</p></KpiCard>
    </div></section> : null}
    <section className="panel productivity-panel"><div className="productivity-macro"><div><p className="eyebrow">Produtividade total</p><h3>{activeName}</h3><strong>{productivityTotal}</strong><span>Total produtivo do mês · ASC + 0800</span></div><div className="productivity-breakdown"><span><b>{data.attendanceCount}</b>Atendimentos ASC</span><span><b>{avayaAgentData?.callCount ?? 0}</b>Chamadas Avaya</span><span><b>{productivityRows.length || "—"}</b>Dias com detalhe</span></div><button type="button" className="detail-button" onClick={() => setProductivityDetailOpen(true)}>Ver detalhes</button></div></section>
  </section> : null}

  {!isChoosingLeader && activeView === "avaya" && (!selectedLeaderGroup || selectedLeaderGroup.agents.length > 0) ? <section className="view-page"><div className="page-heading"><div><p className="eyebrow">0800</p><h2>Avaya</h2><p>Visão geral das chamadas em {avayaDashboard.meta.period.toLowerCase()} para <strong>{selectedTeam.replace("Time ", "")}</strong>{selectedLeaderGroup ? ` · ${selectedLeaderGroup.leader}` : ""}.</p></div><span className="status-pill"><i /> Dados Avaya importados</span></div><section className="kpi-grid">
    <KpiCard icon="☎" tone="primary" title="Quantidade de chamadas" value={avayaTeamData.callCount}><p>{avayaTeamData.answeredCalls} atendidas · {avayaTeamData.callCount} chamadas totais.</p></KpiCard>
    <KpiCard icon="Ⅱ" tone="engagement" title="Quantidade e tipos de pausas" value={avayaDashboard.meta.hasPauseData ? avayaTeamData.pauseCount : "—"}>{pauseSummary.length ? pauseSummary.map(([type, count]) => <p key={type}>{type}: <b>{count}</b></p>) : <p>Este arquivo Avaya não contém dados de pausa.</p>}</KpiCard>
    <KpiCard icon="◷" tone="attendance-total" title="Tempo médio em pausa" value={formatMaybeDuration(avayaTeamData.averagePauseSeconds, avayaDashboard.meta.hasPauseData)}><p>{avayaDashboard.meta.hasPauseData ? "Média consolidada de pausa da equipe." : "Aguardando relatório com duração das pausas."}</p></KpiCard>
    <KpiCard icon="⌁" tone="first-response" title="Tempo médio logado" value={formatMaybeDuration(avayaTeamData.averageLoggedSeconds, avayaDashboard.meta.hasLoggedData)}><p>{avayaDashboard.meta.hasLoggedData ? "Média consolidada de tempo logado." : "Aguardando relatório com tempo logado."}</p></KpiCard>
    <KpiCard icon="!" tone="orange" title="Chamadas perdidas" value={avayaTeamData.missedCalls}><p>Registros classificados como chamada perdida/não atendida no arquivo.</p></KpiCard>
    <KpiCard icon="↘" tone="first-response" title="Chamadas abandonadas" value={avayaTeamData.abandonedCalls}><p>Clientes que abandonaram antes do atendimento.</p></KpiCard>
    <KpiCard icon="⇄" tone="sky" title="Chamadas transferidas" value={avayaTeamData.transferredCalls}><p>Transferências identificadas pela coluna de transferência e tipo de chamada.</p></KpiCard>
  </section><section className="panel table-panel avaya-summary-panel"><div className="panel-heading"><div><p className="eyebrow">Por agente</p><h3>Resumo Avaya por agente · {selectedTeam.replace("Time ", "")}</h3></div><span className="count-badge">{avayaTeamData.callCount} chamadas</span></div><div className="table-wrap"><table className="avaya-table"><thead><tr><th>Agente</th><th>Chamadas</th><th>Atendidas</th><th>Perdidas</th><th>Abandonadas</th><th>Transferidas</th><th>Tempo médio pausado</th><th>Detalhes</th></tr></thead><tbody>
    {avayaAgentNames.map((name) => {
      const item = avayaDashboard.agents[name];
      return <tr key={name}><td><strong>{name}</strong></td><td>{item.callCount}</td><td>{item.answeredCalls}</td><td>{item.missedCalls}</td><td>{item.abandonedCalls}</td><td>{item.transferredCalls}</td><td>{formatMaybeDuration(item.averagePauseSeconds, avayaDashboard.meta.hasPauseData)}</td><td><button type="button" className="detail-button small" onClick={() => setAvayaDetailName(name)}>Ver detalhes</button></td></tr>;
    })}
  </tbody></table></div></section></section> : null}

  {activeView === "uploads" ? <section className="view-page"><div className="page-heading"><div><p className="eyebrow">Gestão de dados</p><h2>Uploads</h2><p>Importe os relatórios no time selecionado no topo da tela.</p></div></div><ImportPanel team={selectedTeam} onUpdated={updateDashboard} /></section> : null}

  {avayaDetailName && avayaDetailData ? <AvayaAgentDetails name={avayaDetailName} data={avayaDetailData} period={avayaDashboard.meta.period} hasPauseData={avayaDashboard.meta.hasPauseData} hasLoggedData={avayaDashboard.meta.hasLoggedData} onClose={() => setAvayaDetailName(null)} /> : null}
  {productivityDetailOpen && data ? <ProductivityDetails name={activeName} rows={productivityRows} onClose={() => setProductivityDetailOpen(false)} /> : null}
  {attendanceDetailOpen && data ? <AttendanceDetails name={activeName} calls={data.attendanceDetails ?? data.recent} onClose={() => setAttendanceDetailOpen(false)} /> : null}
  {surveyDetailOpen && data ? <SurveyDetails name={activeName} data={data} filter={ratingFilter} onFilterChange={setRatingFilter} onClose={() => setSurveyDetailOpen(false)} /> : null}

  <footer className="dashboard-note"><span>i</span><p><strong>Como calculamos:</strong> TMA considera os registros finalizados, inclusive por inatividade. TMPA mede o tempo entre a Data de Atendimento e a Primeira Mensagem do agente; {selectedTeam === "Time Cliente" ? "no Time Cliente, todos os tempos registrados entram nesse cálculo, inclusive acima de 1h" : "no Time Fornecimento, registros acima de 1h ficam fora apenas desse cálculo"}. Engajamento das notas é a quantidade de avaliações recebidas dividida pela quantidade de atendimentos do período.</p></footer>
  </section></main>;
}
