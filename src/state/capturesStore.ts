import { useSyncExternalStore } from "react";
import type { CaptureSnapshot } from "../types/agent";

export type CapturesState = {
  byId: Record<string, CaptureSnapshot>;
  pending: CaptureSnapshot[];
  activeCapturePopup: CaptureSnapshot | null;
};

const initial: CapturesState = {
  byId: {},
  pending: [],
  activeCapturePopup: null,
};

let state = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function rebuild(nextById: Record<string, CaptureSnapshot>, activeCapturePopup: CaptureSnapshot | null): CapturesState {
  const pending = Object.values(nextById)
    .filter((capture) => capture.state === "pending" || capture.state === "duplicate")
    .sort((a, b) => Date.parse(b.updated_at ?? b.created_at ?? "") - Date.parse(a.updated_at ?? a.created_at ?? ""));
  return { byId: nextById, pending, activeCapturePopup };
}

export function replaceCaptures(captures: CaptureSnapshot[]) {
  const byId: Record<string, CaptureSnapshot> = {};
  for (const capture of captures) {
    if (!capture.id) continue;
    byId[capture.id] = capture;
  }
  const currentActive = state.activeCapturePopup?.id ? byId[state.activeCapturePopup.id] ?? null : null;
  state = rebuild(byId, currentActive ?? captures.find((capture) => capture.state === "pending") ?? null);
  emit();
}

export function upsertCapture(capture: CaptureSnapshot) {
  if (!capture.id) return;
  const byId = { ...state.byId, [capture.id]: capture };
  const active =
    state.activeCapturePopup?.id === capture.id
      ? capture
      : state.activeCapturePopup ?? (capture.state === "pending" || capture.state === "duplicate" ? capture : null);
  state = rebuild(byId, active);
  emit();
}

export function removeCapture(id: string) {
  if (!state.byId[id]) return;
  const byId = { ...state.byId };
  delete byId[id];
  const active = state.activeCapturePopup?.id === id ? null : state.activeCapturePopup;
  state = rebuild(byId, active);
  emit();
}

export function setActiveCapturePopup(id: string | null) {
  const next = id ? state.byId[id] ?? null : null;
  state = rebuild(state.byId, next);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCapturesStore(): CapturesState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
