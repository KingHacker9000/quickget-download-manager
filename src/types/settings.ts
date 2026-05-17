export type SpeedMode = "auto" | "manual";

export type HeaderEntry = {
  key: string;
  value: string;
};

export type AdvancedQuickGetSettings = {
  connections: number;
  retries: number;
  queueMode: boolean;
  dynamicSplitting: boolean;
  segmentSize: number;
  bufferSize: number;
  autoBuffer: boolean;
  forceHttp1: boolean;
  maxIdleConnections: number;
  idleTimeoutSeconds: number;
  minSplitSize: number;
  minDynamicFileSize: number;
  writeDiskStatsTarget: string;
  userAgent: string;
  customHeaders: HeaderEntry[];
};

export type QuickGetProfilerRecommendation = {
  source: "profiler" | "manual";
  generatedAt: string;
  connections: number;
  queueMode: boolean;
  segmentSize: number;
  bufferSize: number;
  forceHttp1: boolean;
};

export type ProfilerState = {
  apiAvailable: boolean | null;
  lastCheckedAt: string | null;
  lastRunAt: string | null;
  status: "idle" | "running" | "ready" | "error";
  message?: string;
  runId?: string | null;
  liveStage?: string | null;
  liveStepIndex?: number | null;
  liveStepTotal?: number | null;
  liveLogs?: string[];
  lastError?: string | null;
  artifacts?: {
    profileDir?: string;
    rawCsv?: string;
    summaryCsv?: string;
  } | null;
  recommendation: QuickGetProfilerRecommendation | null;
};

export type AppSettings = {
  launchOnStartup: boolean;
  defaultDownloadFolder: string | null;
  speedMode: SpeedMode;
  maxSimultaneousDownloads: number;
  notificationsEnabled: boolean;
  minimizeToTrayOnClose: boolean;
  gentleRetryOnFailure: boolean;
  advanced: AdvancedQuickGetSettings;
  profiler: ProfilerState;
};

export type SettingsValidationErrors = Partial<Record<keyof AdvancedQuickGetSettings, string>>;

export type EffectiveQuickGetOptions = {
  connections: number;
  retries: number;
  queueMode: boolean;
  dynamic: boolean;
  segmentSize: number;
  bufferSize: number;
  autoBuffer: boolean;
  http1: boolean;
  maxIdleConns: number;
  idleTimeout: number;
  minSplitSize: number;
  minDynamicFileSize: number;
  writeDisk: string;
  userAgent: string;
  headers: Record<string, string>;
};
