export type RatingName = "Ruim" | "Regular" | "Bom" | "Ótimo";
export type TeamName = "Time Cliente" | "Time Fornecimento";

export type RecentCall = {
  protocol: string;
  date: string;
  service: string;
  status: string;
  seconds: number;
  queueSeconds: number;
  finished: boolean;
  firstResponseSeconds?: number | null;
};

export type DailyAttendance = {
  date: string;
  attendanceCount: number;
  completedCount: number;
  timedCount: number;
  totalSeconds: number;
  averageSeconds: number;
  firstResponseCount: number;
  firstResponseSeconds: number;
  averageFirstResponseSeconds: number;
  loggedSeconds?: number;
  pausedSeconds?: number;
  pauseCount?: number;
  pauseTypes?: Record<string, number>;
};

export type SurveyDetail = {
  protocol: string;
  date: string;
  rating: RatingName;
  service: string;
  channel: string;
};

export type AgentData = {
  attendanceCount: number;
  completedCount: number;
  timedCount: number;
  totalSeconds: number;
  averageSeconds: number;
  averageQueueSeconds: number;
  firstResponseCount: number;
  averageFirstResponseSeconds: number;
  minSeconds?: number;
  maxSeconds?: number;
  minFirstResponseSeconds?: number;
  maxFirstResponseSeconds?: number;
  ratings: Record<RatingName, number>;
  ratingTotal: number;
  csat: number;
  loggedSeconds?: number;
  pausedSeconds?: number;
  pauseCount?: number;
  pauseTypes?: Record<string, number>;
  topServices: Array<[string, number]>;
  daily?: Record<string, DailyAttendance>;
  recent: RecentCall[];
  attendanceDetails?: RecentCall[];
  surveyDetails: SurveyDetail[];
};

export type DashboardData = {
  meta: {
    period: string;
    periodKey?: string;
    team?: TeamName;
    firstResponseFormula?: "tmpa_open_to_first_attendance" | "tmpa_attendance_to_first_agent_message_max_1h";
    serviceRows: number;
    surveyRows: number;
    statusCounts: Record<string, number>;
    agentCounts: Record<string, number>;
    importedAt?: string;
    sourceFiles?: string[];
  };
  agents: Record<string, AgentData>;
};
