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

const state: DownloadsState = {
  byId: {},
  activeIds: [],
  completedIds: [],
  activeDownloads: [],
  completedDownloads: [],
  connectionStatus: "starting",
  agentError: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function recomputeLists() {
  const entries = Object.values(state.byId);
  state.activeDownloads = entries.filter(
    (d) => d.state !== "completed" && d.state !== "cancelled" && d.state !== "failed"
  );
  state.completedDownloads = entries.filter((d) => d.state === "completed");
  state.activeIds = state.activeDownloads.map((d) => d.id);
  state.completedIds = state.completedDownloads.map((d) => d.id);
}

function upsert(snapshot: DownloadSnapshot) {
  state.byId[snapshot.id] = {
    ...(state.byId[snapshot.id] ?? {}),
    ...snapshot,
  };
}

export function setConnectionStatus(status: AgentConnectionState) {
  state.connectionStatus = status;
  if (status !== "failed") state.agentError = null;
  emit();
}

export function setAgentError(message: string | null) {
  state.agentError = message;
  emit();
}

export function replaceDownloads(downloads: DownloadSnapshot[]) {
  state.byId = {};
  for (const snapshot of downloads) upsert(snapshot);
  recomputeLists();
  emit();
}

export function applyEvent(event: AgentEvent) {
  if (event.snapshot) {
    upsert(event.snapshot);
    recomputeLists();
    emit();
    return;
  }

  if (event.download_id && state.byId[event.download_id]) {
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
                : state.byId[event.download_id].state;
    state.byId[event.download_id] = {
      ...state.byId[event.download_id],
      state: nextState,
      updated_at: event.timestamp ?? state.byId[event.download_id].updated_at,
      warning: event.type === "download.warning" ? event.message ?? state.byId[event.download_id].warning : state.byId[event.download_id].warning,
      error: event.type === "download.failed" ? event.message ?? state.byId[event.download_id].error : state.byId[event.download_id].error,
    };
    recomputeLists();
    emit();
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
