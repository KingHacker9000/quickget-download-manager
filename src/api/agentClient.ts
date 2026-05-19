import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { AGENT_HOST, AGENT_PORT } from "./agentConfig";
import type {
  AgentErrorResponse,
  AgentEvent,
  AgentStatus,
  CaptureSnapshot,
  CreateDownloadRequest,
  DownloadSnapshot,
  SegmentProgress,
  StartCaptureRequest,
} from "../types/agent";

export const AGENT_BASE_URL = `http://${AGENT_HOST}:${AGENT_PORT}`;
const AGENT_DEV_PROXY_BASE = "/agent";
const AGENT_FETCH_BASE = import.meta.env.DEV ? AGENT_DEV_PROXY_BASE : AGENT_BASE_URL;
const USE_TAURI_HTTP_FALLBACK = !import.meta.env.DEV;

const HEALTH_PATH = "/health";
const DOWNLOADS_PATH = "/downloads";
const CAPTURES_PATH = "/captures";
const EVENTS_PATH = "/events";
const PROFILER_PATH = "/profiler";

type EventCallback = (event: AgentEvent) => void;
type ErrorCallback = (message: string) => void;
type AgentApiDownload = Record<string, unknown>;
type AgentApiEvent = Record<string, unknown>;
type AgentApiCapture = Record<string, unknown>;

let cachedToken: string | null = null;

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePercent(value: number | undefined): number | undefined {
  if (value == null) return undefined;
  return value <= 1 ? value * 100 : value;
}

function mapStatus(status: string | undefined): DownloadSnapshot["state"] {
  if (!status) return "queued";
  switch (status.toLowerCase()) {
    case "queued":
      return "queued";
    case "starting":
      return "starting";
    case "running":
    case "downloading":
      return "downloading";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

function normalizeSnapshot(raw: AgentApiDownload): DownloadSnapshot {
  const outputPath = asString(raw.outputPath) ?? asString(raw.output_path);
  const speedMBps = asNumber(raw.speedMBps);
  const avgMBps = asNumber(raw.avgMBps) ?? asNumber(raw.avg_mbps);
  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined;
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const segments: SegmentProgress[] = rawSegments
    .map((entry): SegmentProgress | null => {
      if (!entry || typeof entry !== "object") return null;
      const seg = entry as Record<string, unknown>;
      const index = asNumber(seg.index);
      const startByte = asNumber(seg.startByte);
      const endByte = asNumber(seg.endByte);
      const downloadedWithin = asNumber(seg.downloadedBytesWithinSegment);
      const status = asString(seg.status);
      if (
        index == null ||
        startByte == null ||
        endByte == null ||
        downloadedWithin == null ||
        status == null
      ) {
        return null;
      }
      return {
        index,
        start_byte: startByte,
        end_byte: endByte,
        downloaded_bytes_within_segment: downloadedWithin,
        status,
        worker_id: asNumber(seg.workerId),
      };
    })
    .filter((segment): segment is SegmentProgress => segment != null);

  const createdAt = asString(raw.createdAt) ?? asString(raw.created_at);
  const completedAt = asString(raw.completedAt) ?? asString(raw.completed_at) ?? null;
  const totalBytes = asNumber(raw.total);
  const downloadedBytes = asNumber(raw.downloaded);
  const meta: Record<string, unknown> = { ...(metadata ?? {}) };
  if (typeof avgMBps === "number" && Number.isFinite(avgMBps) && avgMBps >= 0) {
    meta.averageSpeedBytesPerSec = avgMBps * 1024 * 1024;
  }
  if (createdAt && completedAt) {
    const startMs = Date.parse(createdAt);
    const endMs = Date.parse(completedAt);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      meta.startedAt = createdAt;
      meta.durationMs = endMs - startMs;
      if (meta.averageSpeedBytesPerSec == null) {
        const basis = totalBytes ?? downloadedBytes;
        if (typeof basis === "number" && basis > 0 && endMs > startMs) {
          meta.averageSpeedBytesPerSec = (basis * 1000) / (endMs - startMs);
        }
      }
    }
  }

  return {
    id: asString(raw.id) ?? "",
    url: asString(raw.url),
    filename: asString(raw.filename) ?? asString(raw.fileName) ?? outputPath?.split(/[\\/]/).pop(),
    output_path: outputPath,
    state: mapStatus(asString(raw.status)),
    total_bytes: totalBytes,
    downloaded_bytes: downloadedBytes,
    speed_bytes_per_sec: speedMBps != null ? speedMBps * 1024 * 1024 : undefined,
    progress_percent: normalizePercent(asNumber(raw.percent)),
    warning: undefined,
    error: asString(raw.error),
    created_at: createdAt,
    updated_at: asString(raw.updatedAt) ?? asString(raw.updated_at),
    completed_at: completedAt,
    metadata: Object.keys(meta).length > 0 ? meta : undefined,
    connections: asNumber(raw.connections),
    active_jobs: asNumber(raw.activeJobs),
    mutations: asNumber(raw.mutations),
    segments,
  };
}

function normalizeCapture(raw: AgentApiCapture): CaptureSnapshot {
  const requestRaw = raw.request && typeof raw.request === "object" ? (raw.request as Record<string, unknown>) : {};
  const sourceRaw = raw.source && typeof raw.source === "object" ? (raw.source as Record<string, unknown>) : {};
  const duplicateInfoRaw =
    raw.duplicate_info && typeof raw.duplicate_info === "object" ? (raw.duplicate_info as Record<string, unknown>) : {};
  const duplicateRaw =
    raw.duplicate && typeof raw.duplicate === "object" ? (raw.duplicate as Record<string, unknown>) : duplicateInfoRaw;
  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined;
  const status = asString(raw.status) ?? asString(raw.state) ?? "pending";
  const duplicateFound = duplicateInfoRaw.found === true;
  const effectiveState = status === "pending" && duplicateFound ? "duplicate" : status;
  const requestedFilename = asString(requestRaw.suggested_filename) ?? asString(requestRaw.suggestedFilename);
  const derivedFilenameFromUrl = (() => {
    const url = asString(raw.url) ?? asString(requestRaw.url);
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return parts.length > 0 ? decodeURIComponent(parts[parts.length - 1]) : undefined;
    } catch {
      return undefined;
    }
  })();
  const requestedPageUrl = asString(requestRaw.page_url) ?? asString(requestRaw.pageUrl);
  const requestedReferrer = asString(requestRaw.referrer);
  const requestedDomain = (() => {
    const url = requestedPageUrl ?? requestedReferrer;
    if (!url) return undefined;
    try {
      return new URL(url).hostname;
    } catch {
      return undefined;
    }
  })();
  return {
    id: asString(raw.id) ?? "",
    state: effectiveState,
    url: asString(raw.url) ?? asString(requestRaw.url),
    suggested_filename: asString(raw.suggestedFilename) ?? asString(raw.filename) ?? requestedFilename ?? derivedFilenameFromUrl,
    output_dir: asString(raw.outputDir) ?? asString(raw.directory),
    output_path: asString(raw.outputPath),
    speed_mode: asString(raw.speedMode) === "manual" ? "manual" : "auto",
    source: {
      page_url: asString(sourceRaw.pageUrl) ?? asString(raw.pageUrl) ?? requestedPageUrl,
      referrer: asString(sourceRaw.referrer) ?? asString(raw.referrer) ?? requestedReferrer,
      domain: asString(sourceRaw.domain) ?? asString(raw.domain) ?? requestedDomain,
      user_agent: asString(sourceRaw.userAgent),
      authenticated: typeof sourceRaw.authenticated === "boolean" ? sourceRaw.authenticated : undefined,
    },
    duplicate: {
      reason: asString(duplicateRaw.reason),
      existing_path:
        asString(duplicateRaw.existingPath) ??
        asString(raw.existingPath) ??
        asString(duplicateInfoRaw.existing_output_path),
      existing_download_id:
        asString(duplicateRaw.existingDownloadId) ?? asString(duplicateInfoRaw.existing_download_id),
    },
    metadata,
    created_at: asString(raw.createdAt),
    updated_at: asString(raw.updatedAt),
  };
}

function parseAgentError(body: unknown): AgentErrorResponse | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const nestedError = obj.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : null;
  const message =
    asString(obj.message) ??
    (nestedError ? asString(nestedError.message) : undefined) ??
    asString(obj.error) ??
    asString(obj.detail) ??
    null;
  const code = asString(obj.code) ?? (nestedError ? asString(nestedError.code) : undefined);
  const details = obj.details ?? obj.errors ?? obj.detail ?? nestedError;
  return message ? { code, message, details } : null;
}

function mapCreatePayload(payload: CreateDownloadRequest): Record<string, unknown> {
  const qg = (payload.quickget_options ?? {}) as Record<string, unknown>;
  const outputPath =
    payload.filename && payload.output_dir
      ? `${payload.output_dir.replace(/[\\/]$/, "")}/${payload.filename}`
      : payload.filename ?? undefined;

  return {
    url: payload.url,
    ...(outputPath ? { outputPath } : {}),
    ...(payload.output_dir ? { directory: payload.output_dir } : {}),
    ...(typeof qg.connections === "number" ? { connections: qg.connections } : {}),
    ...(typeof qg.retries === "number" ? { retries: qg.retries } : {}),
    ...(typeof qg.queueMode === "boolean" ? { queueMode: qg.queueMode } : {}),
    ...(typeof qg.dynamic === "boolean" ? { dynamic: qg.dynamic } : {}),
    ...(typeof qg.segmentSize === "number" ? { segmentSize: qg.segmentSize } : {}),
    ...(typeof qg.bufferSize === "number" ? { bufferSize: qg.bufferSize } : {}),
    ...(typeof qg.autoBuffer === "boolean" ? { autoBuffer: qg.autoBuffer } : {}),
    ...(typeof qg.http1 === "boolean" ? { http1: qg.http1 } : {}),
    ...(typeof qg.maxIdleConns === "number" ? { maxIdleConns: qg.maxIdleConns } : {}),
    ...(typeof qg.idleTimeout === "number" ? { idleTimeout: qg.idleTimeout } : {}),
    ...(typeof qg.minSplitSize === "number" ? { minSplitSize: qg.minSplitSize } : {}),
    ...(typeof qg.minDynamicFileSize === "number" ? { minDynamicFileSize: qg.minDynamicFileSize } : {}),
    ...(typeof qg.writeDisk === "string" && qg.writeDisk.trim() ? { writeDisk: qg.writeDisk } : {}),
    ...(typeof qg.userAgent === "string" && qg.userAgent.trim() ? { userAgent: qg.userAgent } : {}),
    ...(payload.headers ? { headers: payload.headers } : {}),
    ...(typeof qg.headers === "object" && qg.headers ? { headers: qg.headers } : {}),
  };
}

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const token = await invoke<string>("get_agent_token");
  cachedToken = token;
  return token;
}

function clearTokenCache() {
  cachedToken = null;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function request<T>(path: string, init: RequestInit = {}, requireAuth = true): Promise<T> {
  const headers: HeadersInit = requireAuth
    ? { ...(await authHeaders()), ...(init.headers ?? {}) }
    : { ...(init.headers ?? {}) };

  let res: Response;
  try {
    res = await fetch(`${AGENT_FETCH_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (!USE_TAURI_HTTP_FALLBACK) throw error;
    res = await tauriFetch(`${AGENT_FETCH_BASE}${path}`, {
      ...init,
      headers,
    });
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearTokenCache();
    }
    let friendly = `Request failed (${res.status})`;
    try {
      const raw = await res.text();
      if (raw.trim().length > 0) {
        try {
          const body = JSON.parse(raw) as unknown;
          const agentError = parseAgentError(body);
          if (agentError?.message) {
            friendly = agentError.message;
          } else {
            friendly = raw;
          }
        } catch {
          friendly = raw;
        }
      }
    } catch {
      // keep fallback
    }
    throw new Error(friendly);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function health(): Promise<AgentStatus> {
  return request<AgentStatus>(HEALTH_PATH, { method: "GET" }, false);
}

export async function listDownloads(): Promise<DownloadSnapshot[]> {
  const response = await request<AgentApiDownload[]>(DOWNLOADS_PATH, { method: "GET" });
  return response.map((item) => normalizeSnapshot(item));
}

export async function createDownload(payload: CreateDownloadRequest): Promise<DownloadSnapshot> {
  const response = await request<AgentApiDownload>(DOWNLOADS_PATH, {
    method: "POST",
    body: JSON.stringify(mapCreatePayload(payload)),
  });
  return normalizeSnapshot(response);
}

export async function getDownload(id: string): Promise<DownloadSnapshot> {
  const response = await request<AgentApiDownload>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}`, { method: "GET" });
  return normalizeSnapshot(response);
}

export async function pauseDownload(id: string): Promise<DownloadSnapshot> {
  const response = await request<AgentApiDownload>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}/pause`, {
    method: "POST",
  });
  return normalizeSnapshot(response);
}

export async function resumeDownload(id: string): Promise<DownloadSnapshot> {
  const response = await request<AgentApiDownload>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}/resume`, {
    method: "POST",
  });
  return normalizeSnapshot(response);
}

export async function cancelDownload(id: string): Promise<DownloadSnapshot> {
  const response = await request<AgentApiDownload>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
  return normalizeSnapshot(response);
}

export async function deleteDownload(id: string, deleteFiles = false): Promise<void> {
  await request<void>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}/delete`, {
    method: "POST",
    ...(deleteFiles ? { body: JSON.stringify({ delete_files: true }) } : {}),
  });
}

function mapStartCapturePayload(payload: StartCaptureRequest): Record<string, unknown> {
  return {
    ...(payload.output_dir ? { directory: payload.output_dir } : {}),
    ...(payload.filename ? { output_path: payload.filename } : {}),
    ...(payload.duplicate_action ? { duplicate_action: payload.duplicate_action } : {}),
  };
}

export async function listCaptures(): Promise<CaptureSnapshot[]> {
  const response = await request<AgentApiCapture[]>(CAPTURES_PATH, { method: "GET" });
  return response.map((item) => normalizeCapture(item));
}

export async function getCapture(id: string): Promise<CaptureSnapshot> {
  const response = await request<AgentApiCapture>(`${CAPTURES_PATH}/${encodeURIComponent(id)}`, { method: "GET" });
  return normalizeCapture(response);
}

export async function rejectCapture(id: string): Promise<CaptureSnapshot> {
  const response = await request<AgentApiCapture>(`${CAPTURES_PATH}/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return normalizeCapture(response);
}

export async function startCaptureDownload(id: string, payload: StartCaptureRequest): Promise<CaptureSnapshot> {
  const response = await request<AgentApiCapture | { capture?: AgentApiCapture }>(`${CAPTURES_PATH}/${encodeURIComponent(id)}/start`, {
    method: "POST",
    body: JSON.stringify(mapStartCapturePayload(payload)),
  });
  const captureRaw =
    response && typeof response === "object" && "capture" in response
      ? ((response as { capture?: AgentApiCapture }).capture ?? {})
      : (response as AgentApiCapture);
  return normalizeCapture(captureRaw);
}

export async function checkProfilerApiAvailable(): Promise<boolean> {
  try {
    await request<Record<string, unknown>>(PROFILER_PATH, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

export async function getProfilerStatus(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(PROFILER_PATH, { method: "GET" });
}

export type RunProfilerRequest = {
  level?: "quick" | "normal" | "exhaustive";
  sizes?: string;
  repeats?: number;
  url?: string;
};

export async function runProfiler(payload?: RunProfilerRequest): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`${PROFILER_PATH}/run`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function cancelProfilerRun(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`${PROFILER_PATH}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

function parseSseFrames(chunk: string): string[] {
  return chunk.split(/\r?\n\r?\n/g).filter((frame) => frame.includes("data:"));
}

function findLastFrameDelimiterIndex(text: string): number {
  const delimiters = ["\r\n\r\n", "\n\n"];
  let index = -1;
  for (const delimiter of delimiters) {
    const current = text.lastIndexOf(delimiter);
    if (current > index) index = current;
  }
  return index;
}

function parseSseEvent(frame: string): AgentEvent | null {
  const dataLines = frame
    .split(/\r?\n/g)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");

  try {
    const raw = JSON.parse(payload) as AgentApiEvent;
    const eventId = asString(raw.id);
    const eventType = typeof raw.type === "string" ? raw.type : "unknown";
    const isDownloadEvent = eventType.startsWith("download.");
    const nestedDownloadId =
      raw.data && typeof raw.data === "object"
        ? asString((raw.data as Record<string, unknown>).download_id) ??
          asString((raw.data as Record<string, unknown>).downloadId)
        : undefined;
    const snapshot =
      isDownloadEvent && eventId != null
        ? normalizeSnapshot({
            ...raw,
            id: eventId,
            updatedAt: raw.updatedAt ?? raw.timestamp,
          } as AgentApiDownload)
        : undefined;

    return {
      type: eventType,
      download_id: isDownloadEvent
        ? eventId ??
          asString(raw.download_id) ??
          asString(raw.downloadId) ??
          nestedDownloadId
        : undefined,
      capture_id:
        asString(raw.capture_id) ??
        asString(raw.captureId) ??
        (eventType.startsWith("capture.") ? eventId : undefined),
      timestamp: typeof raw.timestamp === "string" ? raw.timestamp : undefined,
      snapshot,
      message: typeof raw.message === "string" ? raw.message : undefined,
      data: (raw.data as Record<string, unknown> | undefined) ?? undefined,
    };
  } catch {
    return null;
  }
}

export function connectEvents(onEvent: EventCallback, onError?: ErrorCallback): () => void {
  let aborted = false;
  let abortController: AbortController | null = null;
  let reconnectHandle: number | null = null;
  let reconnectDelayMs = 1000;
  const debugProgressEnabled =
    import.meta.env.DEV &&
    String((import.meta.env as Record<string, unknown>).QDM_DEBUG_PROGRESS ?? import.meta.env.VITE_QDM_DEBUG_PROGRESS ?? "") === "1";
  let progressEventsThisSecond = 0;
  let debugProgressWindowStart = Date.now();
  const debugLastDownloaded = new Map<string, number>();
  let debugSampleCount = 0;

  const scheduleReconnect = () => {
    if (aborted) return;
    if (reconnectHandle) window.clearTimeout(reconnectHandle);
    reconnectHandle = window.setTimeout(() => {
      void start();
    }, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000);
  };

  const start = async () => {
    if (aborted) return;
    abortController = new AbortController();
    try {
      const token = await getToken();
      let res: Response;
      try {
        res = await fetch(`${AGENT_FETCH_BASE}${EVENTS_PATH}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });
      } catch (error) {
        if (!USE_TAURI_HTTP_FALLBACK) throw error;
        res = await tauriFetch(`${AGENT_FETCH_BASE}${EVENTS_PATH}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });
      }

      if (!res.ok || !res.body) {
        if (res.status === 401 || res.status === 403) {
          clearTokenCache();
        }
        throw new Error(`SSE connection failed (${res.status})`);
      }

      reconnectDelayMs = 1000;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lastDelimiterIndex = findLastFrameDelimiterIndex(buffer);
        if (lastDelimiterIndex < 0) continue;
        const complete = buffer.slice(0, lastDelimiterIndex);
        buffer = buffer.slice(lastDelimiterIndex).replace(/^\r?\n\r?\n/, "");
        const frames = parseSseFrames(complete);
        for (const frame of frames) {
          const event = parseSseEvent(frame);
          if (!event) continue;
          if (debugProgressEnabled && event.type === "download.progress") {
            progressEventsThisSecond += 1;
            if (debugSampleCount < 5) {
              console.debug("[QDM] progress sample", {
                id: event.download_id,
                downloaded: event.snapshot?.downloaded_bytes,
                total: event.snapshot?.total_bytes,
                segments: event.snapshot?.segments?.length ?? 0,
                firstSegment: event.snapshot?.segments?.[0],
              });
              debugSampleCount += 1;
            }
            const now = Date.now();
            const id = event.download_id ?? "";
            const downloaded = event.snapshot?.downloaded_bytes ?? 0;
            const prevDownloaded = debugLastDownloaded.get(id) ?? downloaded;
            const delta = downloaded >= prevDownloaded ? downloaded - prevDownloaded : 0;
            debugLastDownloaded.set(id, downloaded);
            if (now-debugProgressWindowStart >= 1000) {
              console.debug(`[QDM] download.progress events/sec: ${progressEventsThisSecond}`, {
                id: event.download_id,
                segmentCount: event.snapshot?.segments?.length ?? 0,
                downloadedDeltaBytes: delta,
                timestamp: new Date().toISOString(),
              });
              progressEventsThisSecond = 0;
              debugProgressWindowStart = now;
            }
          }
          onEvent(event);
        }
      }
    } catch (error) {
      if (!aborted && onError) onError(toErrorMessage(error, "Event stream disconnected"));
    } finally {
      if (!aborted) scheduleReconnect();
    }
  };

  void start();

  return () => {
    aborted = true;
    if (reconnectHandle) window.clearTimeout(reconnectHandle);
    abortController?.abort();
  };
}



