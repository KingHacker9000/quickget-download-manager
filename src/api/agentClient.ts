import { invoke } from "@tauri-apps/api/core";
import { AGENT_HOST, AGENT_PORT } from "./agentConfig";
import type {
  AgentErrorResponse,
  AgentEvent,
  AgentStatus,
  CreateDownloadRequest,
  DownloadSnapshot,
} from "../types/agent";

export const AGENT_BASE_URL = `http://${AGENT_HOST}:${AGENT_PORT}`;
const AGENT_DEV_PROXY_BASE = "/agent";
const AGENT_FETCH_BASE = import.meta.env.DEV ? AGENT_DEV_PROXY_BASE : AGENT_BASE_URL;

const HEALTH_PATH = "/health";
const DOWNLOADS_PATH = "/downloads";
const EVENTS_PATH = "/events";

type EventCallback = (event: AgentEvent) => void;
type ErrorCallback = (message: string) => void;

let cachedToken: string | null = null;

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function parseAgentError(body: unknown): AgentErrorResponse | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const message = typeof obj.message === "string" ? obj.message : null;
  const code = typeof obj.code === "string" ? obj.code : undefined;
  const details = obj.details;
  return message ? { code, message, details } : null;
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

  const res = await fetch(`${AGENT_FETCH_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearTokenCache();
    }
    let friendly = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const agentError = parseAgentError(body);
      if (agentError?.message) friendly = agentError.message;
    } catch {
      // keep friendly fallback
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
  return request<DownloadSnapshot[]>(DOWNLOADS_PATH, { method: "GET" });
}

export async function createDownload(payload: CreateDownloadRequest): Promise<DownloadSnapshot> {
  return request<DownloadSnapshot>(DOWNLOADS_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getDownload(id: string): Promise<DownloadSnapshot> {
  return request<DownloadSnapshot>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function pauseDownload(id: string): Promise<DownloadSnapshot> {
  return request<DownloadSnapshot>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}/pause`, { method: "POST" });
}

export async function resumeDownload(id: string): Promise<DownloadSnapshot> {
  return request<DownloadSnapshot>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}/resume`, { method: "POST" });
}

export async function cancelDownload(id: string): Promise<DownloadSnapshot> {
  return request<DownloadSnapshot>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export async function deleteDownload(id: string, deleteFiles = false): Promise<void> {
  const suffix = deleteFiles ? "?delete_files=true" : "";
  await request<void>(`${DOWNLOADS_PATH}/${encodeURIComponent(id)}${suffix}`, { method: "DELETE" });
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
    const raw = JSON.parse(payload) as Record<string, unknown>;
    return {
      type: typeof raw.type === "string" ? raw.type : "unknown",
      download_id: typeof raw.download_id === "string" ? raw.download_id : undefined,
      timestamp: typeof raw.timestamp === "string" ? raw.timestamp : undefined,
      snapshot: (raw.snapshot as DownloadSnapshot | undefined) ?? undefined,
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
      const res = await fetch(`${AGENT_FETCH_BASE}${EVENTS_PATH}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: abortController.signal,
      });

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
          if (event) onEvent(event);
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
