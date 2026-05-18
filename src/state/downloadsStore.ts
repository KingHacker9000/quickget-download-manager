import { useSyncExternalStore } from "react";
import type { AgentConnectionState, AgentEvent, DownloadSnapshot } from "../types/agent";

export type DownloadsState = {
  byId: Record<string, DownloadSnapshot>;
  activeIds: string[];
  recentCompletedIds: string[];
  historyIds: string[];
  activeDownloads: DownloadSnapshot[];
  recentCompletedDownloads: DownloadSnapshot[];
  historyDownloads: DownloadSnapshot[];
  connectionStatus: AgentConnectionState;
  agentError: string | null;
};

const initialState: DownloadsState = {
  byId: {},
  activeIds: [],
  recentCompletedIds: [],
  historyIds: [],
  activeDownloads: [],
  recentCompletedDownloads: [],
  historyDownloads: [],
  connectionStatus: "starting",
  agentError: null,
};

let state: DownloadsState = initialState;
const listeners = new Set<() => void>();
const debugProgressEnabled =
  import.meta.env.DEV &&
  String((import.meta.env as Record<string, unknown>).QDM_DEBUG_PROGRESS ?? import.meta.env.VITE_QDM_DEBUG_PROGRESS ?? "") === "1";

function emit() {
  for (const listener of listeners) listener();
}

function cloneSnapshot(snapshot: DownloadSnapshot): DownloadSnapshot {
  return {
    ...snapshot,
    segments: snapshot.segments ? snapshot.segments.map((segment) => ({ ...segment })) : undefined,
  };
}

function withDerivedLists(next: Omit<DownloadsState, "activeIds" | "recentCompletedIds" | "historyIds" | "activeDownloads" | "recentCompletedDownloads" | "historyDownloads">): DownloadsState {
  const entries = Object.values(next.byId);
  const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const withSortKey = entries.map((d) => {
    const sortTs = d.updated_at ?? d.completed_at ?? d.created_at ?? "";
    const sortMs = Date.parse(sortTs);
    return { d, sortMs: Number.isFinite(sortMs) ? sortMs : 0 };
  });
  const activeDownloads = entries.filter(
    (d) => d.state !== "completed" && d.state !== "cancelled" && d.state !== "failed"
  );
  const recentCompletedDownloads = entries.filter((d) => {
    if (d.state !== "completed") return false;
    const completedTs = d.completed_at ?? d.updated_at ?? d.created_at;
    if (!completedTs) return false;
    const completedMs = Date.parse(completedTs);
    return Number.isFinite(completedMs) && completedMs >= dayAgoMs;
  });
  const historyDownloads = withSortKey
    .slice()
    .sort((a, b) => b.sortMs - a.sortMs)
    .map((entry) => entry.d);
  return {
    ...next,
    activeDownloads,
    recentCompletedDownloads,
    historyDownloads,
    activeIds: activeDownloads.map((d) => d.id),
    recentCompletedIds: recentCompletedDownloads.map((d) => d.id),
    historyIds: historyDownloads.map((d) => d.id),
  };
}

function setState(updater: (current: DownloadsState) => DownloadsState) {
  state = updater(state);
  emit();
}

function upsertInto(current: DownloadsState, snapshot: DownloadSnapshot): DownloadsState {
  const previous = current.byId[snapshot.id];
  const mergedBase: DownloadSnapshot = { ...(previous ?? {}) };
  for (const [key, value] of Object.entries(snapshot) as Array<[keyof DownloadSnapshot, DownloadSnapshot[keyof DownloadSnapshot]]>) {
    if (value !== undefined) {
      (mergedBase as Record<string, unknown>)[key as string] = value;
    }
  }
  const merged = cloneSnapshot(mergedBase);
  const byId = { ...current.byId, [snapshot.id]: merged };
  return withDerivedLists({
    ...current,
    byId,
  });
}

export function upsertDownload(snapshot: DownloadSnapshot) {
  setState((current) => upsertInto(current, snapshot));
}

export function setConnectionStatus(status: AgentConnectionState) {
  setState((current) =>
    withDerivedLists({
      ...current,
      connectionStatus: status,
      agentError: status !== "failed" ? null : current.agentError,
    })
  );
}

export function setAgentError(message: string | null) {
  setState((current) =>
    withDerivedLists({
      ...current,
      agentError: message,
    })
  );
}

export function replaceDownloads(downloads: DownloadSnapshot[]) {
  setState((current) => {
    const byId: Record<string, DownloadSnapshot> = {};
    for (const snapshot of downloads) {
      byId[snapshot.id] = cloneSnapshot(snapshot);
    }
    return withDerivedLists({
      ...current,
      byId,
    });
  });
}

export function applyEvent(event: AgentEvent) {
  if (event.snapshot) {
    if (debugProgressEnabled && event.type === "download.progress") {
      console.debug("[QDM] store apply progress event", {
        id: event.download_id,
        segments: event.snapshot.segments?.length ?? 0,
        downloaded: event.snapshot.downloaded_bytes,
      });
    }
    setState((current) => upsertInto(current, event.snapshot!));
    return;
  }

  if (event.download_id && state.byId[event.download_id]) {
    setState((current) => {
      const existing = current.byId[event.download_id!];
      if (!existing) return current;
      const nextState =
        event.type === "download.completed"
          ? "completed"
          : event.type === "download.paused"
            ? "paused"
            : event.type === "download.cancelled"
              ? "cancelled"
              : event.type === "download.failed"
                ? "failed"
                : event.type === "download.started" || event.type === "download.progress"
                  ? "downloading"
                  : existing.state;
      const byId = {
        ...current.byId,
        [event.download_id!]: cloneSnapshot({
          ...existing,
          state: nextState,
          updated_at: event.timestamp ?? existing.updated_at,
          warning: event.type === "download.warning" ? event.message ?? existing.warning : existing.warning,
          error: event.type === "download.failed" ? event.message ?? existing.error : existing.error,
        }),
      };
      return withDerivedLists({
        ...current,
        byId,
      });
    });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

export function useDownloadsStore(): DownloadsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
