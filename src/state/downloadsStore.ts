import { useSyncExternalStore } from "react";
import type { AgentConnectionState, AgentEvent, DownloadSnapshot } from "../types/agent";

export type DownloadsState = {
  byId: Record<string, DownloadSnapshot>;
  activeIds: string[];
  completedIds: string[];
  activeDownloads: DownloadSnapshot[];
  completedDownloads: DownloadSnapshot[];
  connectionStatus: AgentConnectionState;
  agentError: string | null;
};

const initialState: DownloadsState = {
  byId: {},
  activeIds: [],
  completedIds: [],
  activeDownloads: [],
  completedDownloads: [],
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

function withDerivedLists(next: Omit<DownloadsState, "activeIds" | "completedIds" | "activeDownloads" | "completedDownloads">): DownloadsState {
  const entries = Object.values(next.byId);
  const activeDownloads = entries.filter(
    (d) => d.state !== "completed" && d.state !== "cancelled" && d.state !== "failed"
  );
  const completedDownloads = entries.filter((d) => d.state === "completed");
  return {
    ...next,
    activeDownloads,
    completedDownloads,
    activeIds: activeDownloads.map((d) => d.id),
    completedIds: completedDownloads.map((d) => d.id),
  };
}

function setState(updater: (current: DownloadsState) => DownloadsState) {
  state = updater(state);
  emit();
}

function upsertInto(current: DownloadsState, snapshot: DownloadSnapshot): DownloadsState {
  const previous = current.byId[snapshot.id];
  const merged = cloneSnapshot({
    ...(previous ?? {}),
    ...snapshot,
  });
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

