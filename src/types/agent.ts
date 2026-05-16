export type AgentStatus = {
  running: boolean;
  base_url: string;
  version?: string | null;
  api_version?: string | null;
  build_commit?: string | null;
  build_date?: string | null;
  message: string;
};

export type AgentConnectionState = "starting" | "connected" | "failed" | "disconnected";

export type CreateDownloadRequest = {
  url: string;
  output_dir?: string;
  filename?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type DownloadState =
  | "queued"
  | "starting"
  | "downloading"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type DownloadSnapshot = {
  id: string;
  url?: string;
  filename?: string;
  output_path?: string;
  state: DownloadState;
  total_bytes?: number;
  downloaded_bytes?: number;
  speed_bytes_per_sec?: number;
  progress_percent?: number;
  eta_seconds?: number;
  warning?: string | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  metadata?: Record<string, unknown>;
  connections?: number;
  active_jobs?: number;
  mutations?: number;
  segments?: SegmentProgress[];
};

export type SegmentProgress = {
  index: number;
  start_byte: number;
  end_byte: number;
  downloaded_bytes_within_segment: number;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled" | string;
  worker_id?: number;
};

export type AgentErrorResponse = {
  code?: string;
  message: string;
  details?: unknown;
};

export const AGENT_EVENT_READY = "agent.ready";
export const AGENT_EVENT_DOWNLOAD_CREATED = "download.created";
export const AGENT_EVENT_DOWNLOAD_STARTED = "download.started";
export const AGENT_EVENT_DOWNLOAD_PROGRESS = "download.progress";
export const AGENT_EVENT_DOWNLOAD_WARNING = "download.warning";
export const AGENT_EVENT_DOWNLOAD_PAUSED = "download.paused";
export const AGENT_EVENT_DOWNLOAD_CANCELLED = "download.cancelled";
export const AGENT_EVENT_DOWNLOAD_COMPLETED = "download.completed";
export const AGENT_EVENT_DOWNLOAD_FAILED = "download.failed";

export type AgentEventType =
  | typeof AGENT_EVENT_READY
  | typeof AGENT_EVENT_DOWNLOAD_CREATED
  | typeof AGENT_EVENT_DOWNLOAD_STARTED
  | typeof AGENT_EVENT_DOWNLOAD_PROGRESS
  | typeof AGENT_EVENT_DOWNLOAD_WARNING
  | typeof AGENT_EVENT_DOWNLOAD_PAUSED
  | typeof AGENT_EVENT_DOWNLOAD_CANCELLED
  | typeof AGENT_EVENT_DOWNLOAD_COMPLETED
  | typeof AGENT_EVENT_DOWNLOAD_FAILED;

export type AgentEvent = {
  type: AgentEventType | string;
  download_id?: string;
  timestamp?: string;
  snapshot?: DownloadSnapshot;
  message?: string;
  data?: Record<string, unknown>;
};
