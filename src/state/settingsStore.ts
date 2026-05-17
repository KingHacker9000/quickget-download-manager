import { useSyncExternalStore } from "react";
import type {
  AppSettings,
  EffectiveQuickGetOptions,
  HeaderEntry,
  QuickGetProfilerRecommendation,
  SettingsValidationErrors,
  SpeedMode,
} from "../types/settings";

const DEFAULT_CONNECTIONS = 8;
const DEFAULT_RETRIES = 3;
const DEFAULT_SEGMENT_SIZE = 16 * 1024 * 1024;
const DEFAULT_BUFFER_SIZE = 1024 * 1024;
const DEFAULT_MAX_IDLE_CONNS = 1024;
const DEFAULT_IDLE_TIMEOUT = 90;
const DEFAULT_MIN_SPLIT_SIZE = 32 * 1024 * 1024;
const DEFAULT_MIN_DYNAMIC_FILE_SIZE = 64 * 1024 * 1024;
const DEFAULT_USER_AGENT = "QuickGet/1.0";

export const GENTLE_RETRY_OPTIONS: Partial<EffectiveQuickGetOptions> = {
  connections: 2,
  retries: 6,
  queueMode: false,
  dynamic: false,
  autoBuffer: true,
  http1: true,
};

export function defaultSettings(): AppSettings {
  return {
    launchOnStartup: false,
    defaultDownloadFolder: null,
    speedMode: "auto",
    maxSimultaneousDownloads: DEFAULT_CONNECTIONS,
    notificationsEnabled: true,
    minimizeToTrayOnClose: true,
    gentleRetryOnFailure: true,
    advanced: {
      connections: DEFAULT_CONNECTIONS,
      retries: DEFAULT_RETRIES,
      queueMode: false,
      dynamicSplitting: true,
      segmentSize: DEFAULT_SEGMENT_SIZE,
      bufferSize: DEFAULT_BUFFER_SIZE,
      autoBuffer: false,
      forceHttp1: true,
      maxIdleConnections: DEFAULT_MAX_IDLE_CONNS,
      idleTimeoutSeconds: DEFAULT_IDLE_TIMEOUT,
      minSplitSize: DEFAULT_MIN_SPLIT_SIZE,
      minDynamicFileSize: DEFAULT_MIN_DYNAMIC_FILE_SIZE,
      writeDiskStatsTarget: "",
      userAgent: DEFAULT_USER_AGENT,
      customHeaders: [],
    },
    profiler: {
      apiAvailable: null,
      lastCheckedAt: null,
      lastRunAt: null,
      status: "idle",
      runId: null,
      liveStage: null,
      liveStepIndex: null,
      liveStepTotal: null,
      liveLogs: [],
      lastError: null,
      artifacts: null,
      recommendation: null,
    },
  };
}

let state: AppSettings = defaultSettings();
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function normalizeHeaders(entries: HeaderEntry[]): HeaderEntry[] {
  return entries
    .map((entry) => ({ key: entry.key.trim(), value: entry.value }))
    .filter((entry) => entry.key.length > 0);
}

function coerceSpeedMode(mode: string): SpeedMode {
  if (mode === "auto" || mode === "manual") {
    return mode;
  }
  return "auto";
}

export function mergeWithDefaults(input: Partial<AppSettings> | null | undefined): AppSettings {
  const base = defaultSettings();
  const candidate = input ?? {};
  const advanced = (candidate.advanced ?? {}) as Partial<AppSettings["advanced"]>;
  const profiler = (candidate.profiler ?? {}) as Partial<AppSettings["profiler"]>;

  return {
    ...base,
    ...candidate,
    speedMode: coerceSpeedMode(String(candidate.speedMode ?? base.speedMode)),
    maxSimultaneousDownloads: Math.max(1, Number(candidate.maxSimultaneousDownloads ?? base.maxSimultaneousDownloads)),
    advanced: {
      ...base.advanced,
      ...advanced,
      customHeaders: normalizeHeaders(advanced.customHeaders ?? base.advanced.customHeaders),
    },
    profiler: {
      ...base.profiler,
      ...profiler,
      recommendation: profiler.recommendation ?? base.profiler.recommendation,
    },
  };
}

export function setSettings(next: AppSettings) {
  loaded = true;
  state = mergeWithDefaults(next);
  emit();
}

export function patchSettings(patch: Partial<AppSettings>) {
  setSettings(mergeWithDefaults({ ...state, ...patch }));
}

export function updateAdvanced<K extends keyof AppSettings["advanced"]>(key: K, value: AppSettings["advanced"][K]) {
  setSettings(
    mergeWithDefaults({
      ...state,
      advanced: {
        ...state.advanced,
        [key]: value,
      },
    })
  );
}

export function resetSettingsDefaults(current?: AppSettings): AppSettings {
  const base = defaultSettings();
  const preserved = current ?? state;
  return {
    ...base,
    launchOnStartup: preserved.launchOnStartup,
    defaultDownloadFolder: preserved.defaultDownloadFolder,
    notificationsEnabled: preserved.notificationsEnabled,
    minimizeToTrayOnClose: preserved.minimizeToTrayOnClose,
  };
}

export function validateAdvancedSettings(settings: AppSettings): SettingsValidationErrors {
  const errors: SettingsValidationErrors = {};
  const { advanced } = settings;
  if (advanced.connections <= 0) errors.connections = "Connections must be > 0.";
  if (advanced.retries < 0) errors.retries = "Retries must be >= 0.";
  if (advanced.bufferSize <= 0) errors.bufferSize = "Buffer size must be > 0.";
  if (advanced.segmentSize <= 0) errors.segmentSize = "Segment size must be > 0.";
  if (advanced.idleTimeoutSeconds <= 0) errors.idleTimeoutSeconds = "Idle timeout must be > 0.";
  return errors;
}

export function hasAdvancedValidationErrors(settings: AppSettings): boolean {
  return Object.keys(validateAdvancedSettings(settings)).length > 0;
}

function headersToMap(entries: HeaderEntry[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) continue;
    headers[key] = entry.value;
  }
  return headers;
}

function autoPreset(settings: AppSettings): EffectiveQuickGetOptions {
  const recommended = settings.profiler.recommendation;
  if (recommended) {
    return {
      ...effectiveBase(settings),
      connections: recommended.connections,
      queueMode: recommended.queueMode,
      segmentSize: recommended.segmentSize,
      bufferSize: recommended.bufferSize,
      http1: recommended.forceHttp1,
    };
  }

  return {
    ...effectiveBase(settings),
    connections: DEFAULT_CONNECTIONS,
    queueMode: true,
    segmentSize: DEFAULT_SEGMENT_SIZE,
    bufferSize: DEFAULT_BUFFER_SIZE,
    retries: DEFAULT_RETRIES,
    dynamic: true,
    autoBuffer: false,
    http1: true,
  };
}

function effectiveBase(settings: AppSettings): EffectiveQuickGetOptions {
  return {
    connections: settings.advanced.connections,
    retries: settings.advanced.retries,
    queueMode: settings.advanced.queueMode,
    dynamic: settings.advanced.dynamicSplitting,
    segmentSize: settings.advanced.segmentSize,
    bufferSize: settings.advanced.bufferSize,
    autoBuffer: settings.advanced.autoBuffer,
    http1: settings.advanced.forceHttp1,
    maxIdleConns: settings.advanced.maxIdleConnections,
    idleTimeout: settings.advanced.idleTimeoutSeconds,
    minSplitSize: settings.advanced.minSplitSize,
    minDynamicFileSize: settings.advanced.minDynamicFileSize,
    writeDisk: settings.advanced.writeDiskStatsTarget.trim(),
    userAgent: settings.advanced.userAgent.trim() || DEFAULT_USER_AGENT,
    headers: headersToMap(settings.advanced.customHeaders),
  };
}

export function getEffectiveQuickGetOptions(settings: AppSettings): EffectiveQuickGetOptions {
  const base = effectiveBase(settings);
  const withMax = { ...base, connections: Math.max(1, settings.maxSimultaneousDownloads) };

  if (settings.speedMode === "manual") return withMax;
  return { ...autoPreset(settings), connections: withMax.connections };
}

export function applyProfilerRecommendation(settings: AppSettings): AppSettings {
  const recommendation = settings.profiler.recommendation;
  if (!recommendation) return settings;

  return mergeWithDefaults({
    ...settings,
    speedMode: "auto",
    advanced: {
      ...settings.advanced,
      connections: recommendation.connections,
      queueMode: recommendation.queueMode,
      segmentSize: recommendation.segmentSize,
      bufferSize: recommendation.bufferSize,
      forceHttp1: recommendation.forceHttp1,
    },
  });
}

export function setProfilerRecommendation(recommendation: QuickGetProfilerRecommendation | null, message?: string) {
  setSettings(
    mergeWithDefaults({
      ...state,
      profiler: {
        ...state.profiler,
        recommendation,
        status: recommendation ? "ready" : state.profiler.status,
        message,
      },
    })
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return { settings: state, loaded };
}

export function useSettingsStore(): { settings: AppSettings; loaded: boolean } {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
