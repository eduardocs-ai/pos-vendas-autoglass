import type { AgentData, DailyAttendance, DashboardData, RatingName, RecentCall, TeamName } from "./dashboard-types";

type ReportRow = Record<string, unknown>;

const AGENTS = [
  "Luciano Padilha", "Lívia Neves", "Eduardo Calegari", "Amanda Piaz",
  "Gerlaine Lima", "Emilly Freitas", "Raissa de Oliveira Rauta", "Iasmim Macedo",
] as const;
const RATINGS: RatingName[] = ["Ruim", "Regular", "Bom", "Ótimo"];
const AGENT_ALIASES: Record<string, (typeof AGENTS)[number]> = {
  "LUCIANO PADILLA": "Luciano Padilha",
  "LUCIANO PADILHA": "Luciano Padilha",
  "LIVIA NEVES": "Lívia Neves",
  "EDUARDO CALEGARI": "Eduardo Calegari",
  "AMANDA PIAZ": "Amanda Piaz",
  "AMANDA PIAZZA": "Amanda Piaz",
  "GERLAINE LIMA": "Gerlaine Lima",
  "EMILLY FREITAS": "Emilly Freitas",
  "RAISSA DE OLIVEIRA RAUTA": "Raissa de Oliveira Rauta",
  "IASMIM MACEDO": "Iasmim Macedo",
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function cleanRow(row: ReportRow) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/^\uFEFF/, "").trim(), value]),
  );
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDuration(value: unknown) {
  const parts = String(value ?? "").match(/\d+/g)?.map(Number) ?? [];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 4) return parts[0] * 86400 + parts[1] * 3600 + parts[2] * 60 + parts[3];
  return 0;
}

function parseOptionalDuration(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text.toUpperCase() === "#VALOR!") return null;
  const seconds = parseDuration(text);
  return seconds || /\b0{1,2}:0{2}:0{2}\b/.test(text) ? seconds : null;
}

function rowValue(row: ReportRow, ...keys: string[]) {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return undefined;
}

function parseDelimited(text: string) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value !== "")) matrix.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); matrix.push(row); }
  const headers = (matrix.shift() ?? []).map((header) => header.trim());
  return matrix.map((values) => cleanRow(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))));
}

async function rowsFromFile(file: File) {
  if (/\.(csv|tsv)$/i.test(file.name)) return [parseDelimited(await file.text())];
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  return workbook.SheetNames.map((name) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false });
    const headerIndex = matrix.findIndex((row) => {
      const headers = row.map((value) => normalize(value));
      return headers.includes("AGENTE") && (headers.includes("DATA") || headers.includes("DATA DE ENTRADA"));
    });
    const header = matrix[headerIndex >= 0 ? headerIndex : 0].map((value) => String(value ?? "").trim());
    return matrix.slice((headerIndex >= 0 ? headerIndex : 0) + 1)
      .map((values) => cleanRow(Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]))));
  });
}

function rowKind(rows: ReportRow[]) {
  const headers = new Set(Object.keys(rows[0] ?? {}));
  if (headers.has("Tempo de Atendimento") && headers.has("Data de Entrada")) return "service";
  if (headers.has("Resposta") && headers.has("Data") && headers.has("Protocolo")) return "survey";
  if (headers.has("Pausa") && headers.has("Data da Pausa") && headers.has("Tempo Pausado")) return "pause";
  if (headers.has("Data de Login") && headers.has("Tempo Logado (segundos)")) return "login";
  return "unknown";
}

function dedupe(rows: ReportRow[], keys: string[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keys.map((field) => String(row[field] ?? "")).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyAgent(): AgentData {
  return {
    attendanceCount: 0, completedCount: 0, timedCount: 0,
    totalSeconds: 0, averageSeconds: 0, averageQueueSeconds: 0,
    firstResponseCount: 0, averageFirstResponseSeconds: 0,
    minSeconds: 0, maxSeconds: 0, minFirstResponseSeconds: 0, maxFirstResponseSeconds: 0,
    ratings: { Ruim: 0, Regular: 0, Bom: 0, "Ótimo": 0 },
    ratingTotal: 0, csat: 0, loggedSeconds: 0, pausedSeconds: 0, pauseCount: 0, pauseTypes: {},
    topServices: [], daily: {}, recent: [], attendanceDetails: [], surveyDetails: [],
  };
}

function emptyDailyAttendance(date: string): DailyAttendance {
  return {
    date, attendanceCount: 0, completedCount: 0, timedCount: 0,
    totalSeconds: 0, averageSeconds: 0,
    firstResponseCount: 0, firstResponseSeconds: 0, averageFirstResponseSeconds: 0,
    loggedSeconds: 0, pausedSeconds: 0, pauseCount: 0, pauseTypes: {},
  };
}

function ratingName(value: unknown): RatingName | null {
  const normalized = normalize(value);
  return RATINGS.find((rating) => normalize(rating) === normalized) ?? null;
}

function isFinishedService(row: ReportRow) {
  const status = normalize(row.Status);
  return Boolean(parseDate(rowValue(row, "Data de finalização", "Data de finaliza��o")))
    || status === "FINALIZADO"
    || status === "FINALIZADO POR INATIVIDADE";
}

export async function processReportFiles(
  files: File[],
  selectedPeriod?: { year: number; month: number },
  team: TeamName = "Time Cliente",
): Promise<DashboardData> {
  const serviceRows: ReportRow[] = [];
  const surveyRows: ReportRow[] = [];
  const pauseRows: ReportRow[] = [];
  const loginRows: ReportRow[] = [];
  for (const file of files) {
    for (const rows of await rowsFromFile(file)) {
      const kind = rowKind(rows);
      if (kind === "service") serviceRows.push(...rows);
      if (kind === "survey") surveyRows.push(...rows);
      if (kind === "pause") pauseRows.push(...rows);
      if (kind === "login") loginRows.push(...rows);
    }
  }

  const services = dedupe(serviceRows, ["Protocolo", "Agente", "Data de Entrada"]);
  const hasOfficialServiceReport = services.some((row) => !("Primeiro atendimento" in row));
  const officialServices = hasOfficialServiceReport
    ? services.filter((row) => !("Primeiro atendimento" in row))
    : services;
  const surveys = dedupe(surveyRows, ["Protocolo", "Agente", "Data"]);
  const pauses = dedupe(pauseRows, ["Agente", "Pausa", "Data da Pausa", "Data da Despausa"]);
  const logins = dedupe(loginRows, ["Agente", "Data de Login", "Data de Logout"]);
  if (!officialServices.length) {
    throw new Error("Selecione o relatório analítico de atendimentos.");
  }

  const targetServiceDates = officialServices
    .filter((row) => AGENT_ALIASES[normalize(row.Agente)])
    .map((row) => parseDate(row["Data de Entrada"]))
    .filter((date): date is Date => Boolean(date));
  const latestDate = targetServiceDates.sort((a, b) => b.getTime() - a.getTime())[0];
  if (!latestDate && !selectedPeriod) throw new Error("Não foi possível identificar a competência dos relatórios.");
  const year = selectedPeriod?.year ?? latestDate!.getFullYear();
  const month = selectedPeriod?.month ?? latestDate!.getMonth();
  const inPeriod = (date: Date | null) => Boolean(date && date.getFullYear() === year && date.getMonth() === month);
  const periodDate = new Date(year, month, 1);
  const periodRaw = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(periodDate);
  const period = periodRaw.charAt(0).toUpperCase() + periodRaw.slice(1);
  const periodKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const agents = Object.fromEntries(AGENTS.map((name) => [name, emptyAgent()])) as Record<string, AgentData>;
  const statusCounts: Record<string, number> = {};
  const agentCounts: Record<string, number> = {};
  const serviceBuckets: Record<string, Record<string, number>> = {};
  const callsByAgent: Record<string, RecentCall[]> = {};

  for (const name of AGENTS) { serviceBuckets[name] = {}; callsByAgent[name] = []; }

  for (const row of officialServices) {
    const agent = AGENT_ALIASES[normalize(row.Agente)];
    const entryDate = parseDate(row["Data de Entrada"]);
    if (!agent || !inPeriod(entryDate)) continue;
    const status = String(row.Status || "Sem status");
    const seconds = parseDuration(row["Tempo de Atendimento"]);
    const queueSeconds = parseDuration(row["Tempo em Fila"]);
    const hasFirstResponseColumn = "Primeiro atendimento" in row;
    const firstResponseFromColumn = parseOptionalDuration(row["Primeiro atendimento"]);
    const firstAttendance = parseDate(row["Data de Atendimento"]);
    const firstAgentMessage = parseDate(row["Primeira Mensagem (Agente)"]);
    const firstResponseFromDates = firstAttendance && firstAgentMessage && firstAgentMessage >= firstAttendance
      ? Math.round((firstAgentMessage.getTime() - firstAttendance.getTime()) / 1000)
      : null;
    const rawFirstResponseSeconds = hasFirstResponseColumn ? firstResponseFromColumn : firstResponseFromDates;
    const firstResponseSeconds = rawFirstResponseSeconds !== null && rawFirstResponseSeconds <= 3600 ? rawFirstResponseSeconds : null;
    const finished = isFinishedService(row);
    const service = String(rowValue(row, "Classificação", "Classifica��o", "Serviço", "Servi�o") || "Sem classificação");
    const call: RecentCall = {
      protocol: String(row.Protocolo || "—"), date: String(row["Data de Entrada"] || "—"),
      service, status, seconds, queueSeconds, finished, firstResponseSeconds,
    };
    callsByAgent[agent].push(call);
    const data = agents[agent];
    const dayKey = entryDate ? entryDate.toISOString().slice(0, 10) : "";
    const daily = dayKey ? (data.daily ??= {})[dayKey] ?? ((data.daily ??= {})[dayKey] = emptyDailyAttendance(dayKey)) : null;
    data.attendanceCount += 1;
    if (daily) daily.attendanceCount += 1;
    data.averageQueueSeconds += queueSeconds;
    if (firstResponseSeconds !== null) {
      data.firstResponseCount += 1;
      data.averageFirstResponseSeconds += firstResponseSeconds;
      if (daily) {
        daily.firstResponseCount += 1;
        daily.firstResponseSeconds += firstResponseSeconds;
      }
      data.minFirstResponseSeconds = data.firstResponseCount === 1 ? firstResponseSeconds : Math.min(data.minFirstResponseSeconds ?? firstResponseSeconds, firstResponseSeconds);
      data.maxFirstResponseSeconds = Math.max(data.maxFirstResponseSeconds ?? 0, firstResponseSeconds);
    }
    if (finished) {
      data.completedCount += 1;
      data.totalSeconds += seconds;
      if (daily) {
        daily.completedCount += 1;
        daily.totalSeconds += seconds;
      }
      if (seconds > 0) {
        data.timedCount += 1;
        if (daily) daily.timedCount += 1;
        data.minSeconds = data.timedCount === 1 ? seconds : Math.min(data.minSeconds ?? seconds, seconds);
        data.maxSeconds = Math.max(data.maxSeconds ?? 0, seconds);
      }
    }
    serviceBuckets[agent][service] = (serviceBuckets[agent][service] ?? 0) + 1;
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    agentCounts[agent] = (agentCounts[agent] ?? 0) + 1;
  }

  for (const row of surveys) {
    const agent = AGENT_ALIASES[normalize(row.Agente)];
    const date = parseDate(row.Data);
    const rating = ratingName(row.Resposta);
    if (!agent || !rating || !inPeriod(date)) continue;
    agents[agent].ratings[rating] += 1;
    agents[agent].surveyDetails.push({
      protocol: String(row.Protocolo || "—"), date: String(row.Data || "—"), rating,
      service: String(row["Serviço"] || "Sem classificação"), channel: String(row.Canal || "—"),
    });
  }

  for (const row of pauses) {
    const agent = AGENT_ALIASES[normalize(row.Agente)];
    const date = parseDate(row["Data da Pausa"]);
    if (!agent || !inPeriod(date)) continue;
    const seconds = parseDuration(row["Tempo Pausado"]);
    const pause = String(row.Pausa || "Pausa não informada");
    const data = agents[agent];
    const dayKey = date ? date.toISOString().slice(0, 10) : "";
    const daily = dayKey ? (data.daily ??= {})[dayKey] ?? ((data.daily ??= {})[dayKey] = emptyDailyAttendance(dayKey)) : null;
    data.pausedSeconds = (data.pausedSeconds ?? 0) + seconds;
    data.pauseCount = (data.pauseCount ?? 0) + 1;
    data.pauseTypes = data.pauseTypes ?? {};
    data.pauseTypes[pause] = (data.pauseTypes[pause] ?? 0) + 1;
    if (daily) {
      daily.pausedSeconds = (daily.pausedSeconds ?? 0) + seconds;
      daily.pauseCount = (daily.pauseCount ?? 0) + 1;
      daily.pauseTypes = daily.pauseTypes ?? {};
      daily.pauseTypes[pause] = (daily.pauseTypes[pause] ?? 0) + 1;
    }
  }

  for (const row of logins) {
    const agent = AGENT_ALIASES[normalize(row.Agente)];
    const date = parseDate(row["Data de Login"]);
    if (!agent || !inPeriod(date)) continue;
    const seconds = parseDuration(row["Tempo Logado (segundos)"]);
    const data = agents[agent];
    const dayKey = date ? date.toISOString().slice(0, 10) : "";
    const daily = dayKey ? (data.daily ??= {})[dayKey] ?? ((data.daily ??= {})[dayKey] = emptyDailyAttendance(dayKey)) : null;
    data.loggedSeconds = (data.loggedSeconds ?? 0) + seconds;
    if (daily) daily.loggedSeconds = (daily.loggedSeconds ?? 0) + seconds;
  }

  for (const name of AGENTS) {
    const data = agents[name];
    data.averageQueueSeconds = data.attendanceCount ? Math.round(data.averageQueueSeconds / data.attendanceCount) : 0;
    data.averageFirstResponseSeconds = data.firstResponseCount
      ? Math.round(data.averageFirstResponseSeconds / data.firstResponseCount)
      : 0;
    data.averageSeconds = data.timedCount ? Math.round(data.totalSeconds / data.timedCount) : 0;
    data.ratingTotal = RATINGS.reduce((sum, rating) => sum + data.ratings[rating], 0);
    data.csat = data.ratingTotal ? Math.round(((data.ratings.Bom + data.ratings["Ótimo"]) / data.ratingTotal) * 1000) / 10 : 0;
    data.topServices = Object.entries(serviceBuckets[name]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    Object.values(data.daily ?? {}).forEach((daily) => {
      daily.averageSeconds = daily.timedCount ? Math.round(daily.totalSeconds / daily.timedCount) : 0;
      daily.averageFirstResponseSeconds = daily.firstResponseCount ? Math.round(daily.firstResponseSeconds / daily.firstResponseCount) : 0;
    });
    data.recent = callsByAgent[name].sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0)).slice(0, 8);
    data.attendanceDetails = callsByAgent[name].sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0));
    data.surveyDetails.sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0));
  }

  const totalAttendances = Object.values(agents).reduce((sum, agent) => sum + agent.attendanceCount, 0);
  if (!totalAttendances) {
    throw new Error(`Nenhum atendimento dos agentes cadastrados foi encontrado em ${period}. Confira a competência e o time selecionados.`);
  }

  return {
    meta: {
      period, periodKey, team, firstResponseFormula: "tmpa_attendance_to_first_agent_message_max_1h",
      serviceRows: officialServices.length, surveyRows: surveys.length,
      statusCounts, agentCounts, importedAt: new Date().toISOString(), sourceFiles: files.map((file) => file.name),
    },
    agents,
  };
}
