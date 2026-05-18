import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AGENT_EVENT_DOWNLOAD_COMPLETED,
  type AgentConnectionState,
  type AgentStatus,
  type CreateDownloadRequest,
} from "./types/agent";
import {
  cancelProfilerRun,
  cancelDownload,
  checkProfilerApiAvailable,
  connectEvents,
  createDownload,
  deleteDownload,
  getProfilerStatus,
  listDownloads,
  pauseDownload,
  runProfiler,
  type RunProfilerRequest,
  resumeDownload,
} from "./api/agentClient";
import { getSettings, handleQuitAction, hasActiveDownloads, saveSettings } from "./api/settingsClient";
import {
  applyEvent,
  replaceDownloads,
  setAgentError,
  setConnectionStatus,
  upsertDownload,
  useDownloadsStore,
} from "./state/downloadsStore";
import { QuitConfirmModal } from "./components/QuitConfirmModal";
import { DownloadsPage } from "./pages/DownloadsPage";
import { Toasts, type ToastItem, type ToastTone } from "./components/Toasts";
import type { AppSettings } from "./types/settings";
import {
  applyProfilerRecommendation,
  GENTLE_RETRY_OPTIONS,
  defaultSettings,
  getEffectiveQuickGetOptions,
  mergeWithDefaults,
} from "./state/settingsStore";
import { AGENT_EVENT_DOWNLOAD_FAILED } from "./types/agent";

function getErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; cause?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim().length > 0) return maybe.message;
    if (typeof maybe.cause === "string" && maybe.cause.trim().length > 0) return maybe.cause;
  }
  return "Unable to connect to quickget-agent";
}

async function notifyCompletion(message: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Download completed", { body: message });
    return;
  }
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification("Download completed", { body: message });
    }
  }
}

export default function App() {
  const [agentState, setAgentState] = useState<AgentConnectionState>("starting");
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [showQuitPrompt, setShowQuitPrompt] = useState(false);
  const [quitBusy, setQuitBusy] = useState(false);
  const [forceShowDownloadsToken, setForceShowDownloadsToken] = useState(0);
  const toastIdRef = useRef(1);
  const previousConnectionRef = useRef<AgentConnectionState>("starting");
  const notifiedCompletions = useRef<Set<string>>(new Set());
  const downloadsState = useDownloadsStore();

  const pushToast = (message: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const markBusy = (id: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    let disconnectEvents: (() => void) | null = null;

    const connect = async () => {
      setAgentState("starting");
      setConnectionStatus("starting");
      setErrorMessage(null);
      try {
        const status = await invoke<AgentStatus>("ensure_agent_running");
        if (!active) return;
        setAgentStatus(status);
        if (import.meta.env.DEV) {
          console.info(
            "[QDM] quickget-agent connected",
            {
              version: status.version ?? "unknown",
              apiVersion: status.api_version ?? "unknown",
              buildCommit: status.build_commit ?? "n/a",
              buildDate: status.build_date ?? "n/a",
              baseUrl: status.base_url,
            },
          );
        }
        if (!status.running) {
          setAgentState("disconnected");
          setConnectionStatus("disconnected");
          setErrorMessage(status.message);
          return;
        }

        const downloads = await listDownloads();
        if (!active) return;
        replaceDownloads(downloads);
        setAgentState("connected");
        setConnectionStatus("connected");

        disconnectEvents = connectEvents(
          (event) => {
            applyEvent(event);
            setConnectionStatus("connected");

            if (event.type === AGENT_EVENT_DOWNLOAD_COMPLETED && event.download_id) {
              if (notifiedCompletions.current.has(event.download_id)) return;
              notifiedCompletions.current.add(event.download_id);
              const fileLabel = event.snapshot?.filename ?? event.download_id;
              const message = `${fileLabel} completed`;
              pushToast(message, "success");
              void notifyCompletion(message);
            }
            if (event.type === AGENT_EVENT_DOWNLOAD_FAILED && event.snapshot && settings?.gentleRetryOnFailure) {
              const s = event.snapshot;
              void createDownload({
                url: s.url ?? "",
                output_dir: s.output_path ? s.output_path.replace(/[\\/][^\\/]+$/, "") : settings.defaultDownloadFolder ?? undefined,
                filename: s.filename,
                quickget_options: GENTLE_RETRY_OPTIONS,
              }).then(upsertDownload).catch(() => {});
            }

            if (event.type.startsWith("profiler.")) {
              const data = event.data ?? {};
              const msg = (typeof data.message === "string" && data.message) || event.message || "";
              setSettings((prev) => {
                if (!prev) return prev;
                const logs = prev.profiler.liveLogs ?? [];
                if (event.type === "profiler.started") {
                  return {
                    ...prev,
                    profiler: {
                      ...prev.profiler,
                      apiAvailable: true,
                      status: "running",
                      runId: typeof data.run_id === "string" ? data.run_id : prev.profiler.runId ?? null,
                      liveStage: "prepare",
                      liveStepIndex: 0,
                      liveStepTotal: null,
                      liveLogs: [],
                      lastError: null,
                      message: msg || "Profiler started.",
                    },
                  };
                }
                if (event.type === "profiler.stage" || event.type === "profiler.log") {
                  const nextLogs = event.type === "profiler.log" && msg ? [...logs, msg].slice(-200) : logs;
                  return {
                    ...prev,
                    profiler: {
                      ...prev.profiler,
                      status: "running",
                      runId: typeof data.run_id === "string" ? data.run_id : prev.profiler.runId ?? null,
                      liveStage: typeof data.stage === "string" ? data.stage : prev.profiler.liveStage ?? null,
                      liveStepIndex: typeof data.step_index === "number" ? data.step_index : prev.profiler.liveStepIndex ?? null,
                      liveStepTotal: typeof data.step_total === "number" ? data.step_total : prev.profiler.liveStepTotal ?? null,
                      liveLogs: nextLogs,
                      message: msg || prev.profiler.message,
                    },
                  };
                }
                if (event.type === "profiler.completed") {
                  const recommendation = (data.recommendation ?? {}) as Record<string, unknown>;
                  const artifacts = (data.artifacts ?? {}) as Record<string, unknown>;
                  return {
                    ...prev,
                    profiler: {
                      ...prev.profiler,
                      apiAvailable: true,
                      status: "ready",
                      lastRunAt: new Date().toISOString(),
                      lastError: null,
                      message: msg || "Profiler recommendation updated.",
                      recommendation: {
                        source: "profiler",
                        generatedAt: new Date().toISOString(),
                        connections: Number(recommendation.connections ?? prev.maxSimultaneousDownloads),
                        queueMode: Boolean(recommendation.queueMode ?? true),
                        segmentSize: Number(recommendation.segmentSize ?? prev.advanced.segmentSize),
                        bufferSize: Number(recommendation.bufferSize ?? prev.advanced.bufferSize),
                        forceHttp1: Boolean(recommendation.http1 ?? prev.advanced.forceHttp1),
                      },
                      artifacts: {
                        profileDir: typeof artifacts.profileDir === "string" ? artifacts.profileDir : undefined,
                        rawCsv: typeof artifacts.rawCsv === "string" ? artifacts.rawCsv : undefined,
                        summaryCsv: typeof artifacts.summaryCsv === "string" ? artifacts.summaryCsv : undefined,
                      },
                    },
                  };
                }
                if (event.type === "profiler.failed") {
                  const err = typeof data.message === "string" ? data.message : msg || "Profiler failed.";
                  return {
                    ...prev,
                    profiler: {
                      ...prev.profiler,
                      status: "error",
                      lastRunAt: new Date().toISOString(),
                      lastError: err,
                      message: err,
                    },
                  };
                }
                if (event.type === "profiler.cancelled") {
                  return {
                    ...prev,
                    profiler: {
                      ...prev.profiler,
                      status: "idle",
                      liveStage: "cancelled",
                      message: msg || "Profiler run cancelled.",
                      lastError: null,
                    },
                  };
                }
                return prev;
              });
            }
          },
          (message) => {
            setConnectionStatus("disconnected");
            setAgentError(message);
            setErrorMessage(message);
          }
        );
      } catch (error) {
        if (!active) return;
        setAgentState("failed");
        setConnectionStatus("failed");
        const message = getErrorMessage(error);
        setErrorMessage(message);
        setAgentError(message);
      }
    };

    void connect();
    return () => {
      active = false;
      if (disconnectEvents) disconnectEvents();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setSettings(mergeWithDefaults(await getSettings()));
      } catch (error) {
        pushToast(`Failed to load settings: ${getErrorMessage(error)}`, "error");
        setSettings(defaultSettings());
      }
    })();
  }, []);

  useEffect(() => {
    const unlistenPromises = [
      listen("tray://show-downloads", async () => {
        setForceShowDownloadsToken((v) => v + 1);
      }),
      listen("tray://downloads-paused", async () => {
        const downloads = await listDownloads();
        replaceDownloads(downloads);
        pushToast("All active downloads paused", "info");
      }),
      listen("tray://downloads-resumed", async () => {
        const downloads = await listDownloads();
        replaceDownloads(downloads);
        pushToast("Paused downloads resumed", "info");
      }),
      listen("app://request-quit", async () => {
        const active = await hasActiveDownloads();
        if (!active) {
          await handleQuitAction("pauseAndQuit");
          return;
        }
        setShowQuitPrompt(true);
      }),
    ];

    return () => {
      for (const promise of unlistenPromises) {
        void promise.then((unlisten) => unlisten());
      }
    };
  }, []);

  useEffect(() => {
    if (downloadsState.connectionStatus === previousConnectionRef.current) return;

    if (downloadsState.connectionStatus === "connected" && previousConnectionRef.current !== "starting") {
      pushToast("Agent connected", "success");
    }

    if (downloadsState.connectionStatus === "disconnected") {
      pushToast("Agent disconnected", "error");
    }

    previousConnectionRef.current = downloadsState.connectionStatus;
  }, [downloadsState.connectionStatus]);

  useEffect(() => {
    if (downloadsState.connectionStatus === "connected") {
      setAgentState("connected");
      return;
    }
    if (downloadsState.connectionStatus === "disconnected" && agentState !== "failed") {
      setAgentState("disconnected");
    }
    if (downloadsState.agentError) {
      setErrorMessage(downloadsState.agentError);
    }
  }, [downloadsState.connectionStatus, downloadsState.agentError, agentState]);

  const onCreateDownload = async (request: CreateDownloadRequest) => {
    try {
      const activeSettings = settings ?? defaultSettings();
      const effective = getEffectiveQuickGetOptions(activeSettings);
      let snapshot;
      try {
        snapshot = await createDownload({
          ...request,
          output_dir: request.output_dir ?? activeSettings.defaultDownloadFolder ?? undefined,
          quickget_options: {
            ...effective,
            headers: effective.headers,
          },
          headers: Object.keys(effective.headers).length > 0 ? effective.headers : request.headers,
        });
      } catch (error) {
        const message = getErrorMessage(error).toLowerCase();
        const shouldRetryWithoutMetadata =
          message.includes("invalid json body");
        if (!shouldRetryWithoutMetadata) throw error;
        snapshot = await createDownload({
          url: request.url,
          output_dir: request.output_dir ?? activeSettings.defaultDownloadFolder ?? undefined,
          filename: request.filename,
          headers: Object.keys(effective.headers).length > 0 ? effective.headers : request.headers,
          quickget_options: {
            connections: effective.connections,
            queueMode: effective.queueMode,
            segmentSize: effective.segmentSize,
            bufferSize: effective.bufferSize,
            retries: effective.retries,
            autoBuffer: effective.autoBuffer,
            http1: effective.http1,
          },
        });
      }
      upsertDownload(snapshot);
      setAgentError(null);
      setErrorMessage(null);
      pushToast("Download added", "success");
    } catch (error) {
      const message = getErrorMessage(error);
      pushToast(`Download failed to create: ${message}`, "error");
      throw error;
    }
  };

  const runAction = async (id: string, action: () => Promise<void>) => {
    try {
      markBusy(id, true);
      await action();
      setAgentError(null);
      setErrorMessage(null);
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      pushToast(`Action failed: ${message}`, "error");
    } finally {
      markBusy(id, false);
    }
  };

  const onPause = async (id: string) => {
    await runAction(id, async () => {
      const snapshot = await pauseDownload(id);
      upsertDownload(snapshot);
    });
  };

  const onResume = async (id: string) => {
    await runAction(id, async () => {
      const snapshot = await resumeDownload(id);
      upsertDownload(snapshot);
    });
  };

  const onCancel = async (id: string) => {
    await runAction(id, async () => {
      const snapshot = await cancelDownload(id);
      upsertDownload(snapshot);
    });
  };

  const onDelete = async (id: string) => {
    await runAction(id, async () => {
      await deleteDownload(id, false);
      const downloads = await listDownloads();
      replaceDownloads(downloads);
    });
  };

  const onSettingsChange = async (next: AppSettings) => {
    setSettings(next);
    try {
      setSettingsBusy(true);
      const persisted = await saveSettings(next);
      setSettings(mergeWithDefaults(persisted));
    } catch (error) {
      pushToast(`Failed to save settings: ${getErrorMessage(error)}`, "error");
    } finally {
      setSettingsBusy(false);
    }
  };

  const onRefreshProfilerStatus = async () => {
    const available = await checkProfilerApiAvailable();
    if (!settings) return;
    let recommendation = settings.profiler.recommendation;
    let artifacts = settings.profiler.artifacts ?? null;
    let status = settings.profiler.status;
    let runId = settings.profiler.runId ?? null;
    let message = available ? "Profiler API detected." : "Profiler integration requires quickget-agent profiler API.";
    if (available) {
      try {
        const state = await getProfilerStatus();
        const rawRec = (state.recommendation ?? {}) as Record<string, unknown>;
        if (Object.keys(rawRec).length > 0) {
          recommendation = {
            source: "profiler",
            generatedAt: new Date().toISOString(),
            connections: Number(rawRec.connections ?? settings.maxSimultaneousDownloads),
            queueMode: Boolean(rawRec.queueMode ?? true),
            segmentSize: Number(rawRec.segmentSize ?? settings.advanced.segmentSize),
            bufferSize: Number(rawRec.bufferSize ?? settings.advanced.bufferSize),
            forceHttp1: Boolean(rawRec.http1 ?? settings.advanced.forceHttp1),
          };
        }
        const rawArtifacts = (state.artifacts ?? {}) as Record<string, unknown>;
        artifacts = Object.keys(rawArtifacts).length
          ? {
              profileDir: typeof rawArtifacts.profileDir === "string" ? rawArtifacts.profileDir : undefined,
              rawCsv: typeof rawArtifacts.rawCsv === "string" ? rawArtifacts.rawCsv : undefined,
              summaryCsv: typeof rawArtifacts.summaryCsv === "string" ? rawArtifacts.summaryCsv : undefined,
            }
          : artifacts;
        status = typeof state.status === "string" ? (state.status as AppSettings["profiler"]["status"]) : status;
        runId = typeof state.runId === "string" ? state.runId : runId;
      } catch {
        // keep availability-only status if response shape parse fails
      }
    }
    const next: AppSettings = {
      ...settings,
      profiler: {
        ...settings.profiler,
        apiAvailable: available,
        lastCheckedAt: new Date().toISOString(),
        status: available ? status : "error",
        runId,
        recommendation,
        artifacts,
        message,
      },
    };
    await onSettingsChange(next);
  };

  const onRunProfiler = async (request?: RunProfilerRequest) => {
    if (!settings) return;
    await onSettingsChange({
      ...settings,
      profiler: {
        ...settings.profiler,
        status: "running",
        message: "Starting profiler...",
        runId: null,
        liveStage: "prepare",
        liveStepIndex: 0,
        liveStepTotal: null,
        liveLogs: [],
        lastError: null,
      },
    });
    try {
      await runProfiler(request);
    } catch (error) {
      await onSettingsChange({
        ...settings,
        profiler: {
          ...settings.profiler,
          status: "error",
          lastError: getErrorMessage(error),
          message: getErrorMessage(error),
        },
      });
    }
  };

  const onCancelProfiler = async () => {
    if (!settings) return;
    try {
      await cancelProfilerRun();
      await onSettingsChange({
        ...settings,
        profiler: {
          ...settings.profiler,
          status: "idle",
          message: "Cancelling profiler run...",
        },
      });
    } catch (error) {
      await onSettingsChange({
        ...settings,
        profiler: {
          ...settings.profiler,
          status: "error",
          lastError: getErrorMessage(error),
          message: getErrorMessage(error),
        },
      });
    }
  };

  const onRestoreRecommended = () => {
    if (!settings || !settings.profiler.recommendation) return;
    void onSettingsChange(applyProfilerRecommendation(settings));
  };

  const runQuitAction = async (action: "pauseAndQuit" | "keepRunning" | "cancel") => {
    try {
      setQuitBusy(true);
      await handleQuitAction(action);
      setShowQuitPrompt(false);
    } catch (error) {
      pushToast(`Quit action failed: ${getErrorMessage(error)}`, "error");
    } finally {
      setQuitBusy(false);
    }
  };

  return (
    <>
      <DownloadsPage
        agentState={agentState}
        agentStatus={agentStatus}
        errorMessage={errorMessage}
        activeDownloads={downloadsState.activeDownloads}
        recentCompletedDownloads={downloadsState.recentCompletedDownloads}
        historyDownloads={downloadsState.historyDownloads}
        busyIds={busyIds}
        onCreateDownload={onCreateDownload}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onDelete={onDelete}
        settings={settings}
        settingsBusy={settingsBusy}
        onSettingsChange={onSettingsChange}
        onRunProfiler={onRunProfiler}
        onCancelProfiler={onCancelProfiler}
        onRefreshProfilerStatus={onRefreshProfilerStatus}
        onRestoreRecommended={onRestoreRecommended}
        forceShowDownloadsToken={forceShowDownloadsToken}
        onNotify={pushToast}
      />
      <Toasts items={toasts} onDismiss={dismissToast} />
      <QuitConfirmModal
        open={showQuitPrompt}
        busy={quitBusy}
        onPauseAndQuit={() => void runQuitAction("pauseAndQuit")}
        onKeepRunning={() => void runQuitAction("keepRunning")}
        onCancel={() => void runQuitAction("cancel")}
      />
    </>
  );
}
