import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AGENT_EVENT_DOWNLOAD_COMPLETED,
  type AgentConnectionState,
  type AgentStatus,
  type CreateDownloadRequest,
  type QdmRuntimeBuildInfo,
} from "./types/agent";
import {
  cancelProfilerRun,
  cancelDownload,
  checkProfilerApiAvailable,
  connectEvents,
  createDownload,
  deleteDownload,
  getDownload,
  getCapture,
  listCaptures,
  getProfilerStatus,
  listDownloads,
  pauseDownload,
  rejectCapture,
  runProfiler,
  startCaptureDownload,
  type RunProfilerRequest,
  resumeDownload,
} from "./api/agentClient";
import { getSettings, handleQuitAction, hasActiveDownloads, saveSettings } from "./api/settingsClient";
import {
  applyEvent,
  reconcileDownloads,
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
import { BrowserCapturePopup } from "./components/BrowserCapturePopup";
import { fileExists, openDownloadFile, openDownloadFolder } from "./api/fileActionsClient";
import { removeCapture, replaceCaptures, setActiveCapturePopup, upsertCapture, useCapturesStore } from "./state/capturesStore";
import { APP_NAME, APP_VERSION, FRONTEND_BUILD_COMMIT, FRONTEND_BUILD_TIME } from "./constants/appInfo";
import { formatDiagnosticsReport, sanitizeDiagnostic, type DiagnosticEntry, type DiagnosticLevel, type DiagnosticSource } from "./utils/diagnostics";
import { isSupportedAgentApiVersion, mapFriendlyError, REQUIRED_AGENT_API_MESSAGE, toFriendlyErrorMessage } from "./utils/errorMessages";

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

function asFriendlyMessage(message: string | null | undefined, fallback: string): string {
  if (!message || !message.trim()) return fallback;
  return mapFriendlyError(message) ?? message;
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
  const isCapturePopupWindow = (() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("capturePopup") === "1") {
      return true;
    }
    try {
      return getCurrentWindow().label === "capture-popup";
    } catch {
      return false;
    }
  })();
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
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const toastIdRef = useRef(1);
  const diagnosticsIdRef = useRef(1);
  const previousConnectionRef = useRef<AgentConnectionState>("starting");
  const notifiedCompletions = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings | null>(null);
  const downloadsState = useDownloadsStore();
  const capturesState = useCapturesStore();
  const [captureBusyId, setCaptureBusyId] = useState<string | null>(null);
  const [captureWindowDownloadId, setCaptureWindowDownloadId] = useState<string | null>(null);
  const [runtimeBuildInfo, setRuntimeBuildInfo] = useState<QdmRuntimeBuildInfo | null>(null);

  const pushDiagnostic = (
    source: DiagnosticSource,
    message: string,
    level: DiagnosticLevel = "info",
    details?: Record<string, unknown>
  ) => {
    const next: DiagnosticEntry = sanitizeDiagnostic({
      id: diagnosticsIdRef.current++,
      at: new Date().toISOString(),
      source,
      level,
      message,
      details,
    });
    setDiagnostics((current) => [next, ...current].slice(0, 250));
  };

  const pushToast = (message: string, tone: ToastTone = "info") => {
    const friendly = asFriendlyMessage(message, message);
    const id = toastIdRef.current++;
    setToasts((current) => [...current, { id, message: friendly, tone }]);
    const level: DiagnosticLevel = tone === "error" ? "error" : tone === "success" ? "info" : "info";
    pushDiagnostic("ui", `Toast: ${friendly}`, level);
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

  const showCapturePopupWindow = async () => {
    try {
      await invoke("show_capture_popup_window");
    } catch (error) {
      const message = toFriendlyErrorMessage(error, "Failed to open browser capture popup window.");
      pushDiagnostic("system", message, "warn");
    }
  };

  useEffect(() => {
    pushDiagnostic("system", `${APP_NAME} ${APP_VERSION} started`);
    pushDiagnostic("system", `Window role: ${isCapturePopupWindow ? "capture-popup" : "main"}`, "info", {
      frontendBuildCommit: FRONTEND_BUILD_COMMIT,
      frontendBuildTime: FRONTEND_BUILD_TIME,
    });
    console.info("[QDM] window startup", {
      role: isCapturePopupWindow ? "capture-popup" : "main",
      frontendBuildCommit: FRONTEND_BUILD_COMMIT,
      frontendBuildTime: FRONTEND_BUILD_TIME,
    });
    void invoke<QdmRuntimeBuildInfo>("get_qdm_runtime_build_info")
      .then((info) => {
        setRuntimeBuildInfo(info);
        pushDiagnostic("system", "Loaded runtime build stamp", "info", info as unknown as Record<string, unknown>);
      })
      .catch((error) => {
        const message = toFriendlyErrorMessage(error, "Failed to read runtime build stamp.");
        pushDiagnostic("system", message, "warn");
      });
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let active = true;
    let disconnectEvents: (() => void) | null = null;

    const connect = async () => {
      setAgentState("starting");
      setConnectionStatus("starting");
      setErrorMessage(null);
      pushDiagnostic("system", "Starting agent connection flow");
      try {
        const status = await invoke<AgentStatus>("ensure_agent_running");
        if (!active) return;
        setAgentStatus(status);
        pushDiagnostic("agent", "Agent health received", "info", {
          running: status.running,
          version: status.version ?? "unknown",
          apiVersion: status.api_version ?? "unknown",
          baseUrl: status.base_url ?? "unknown",
        });
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
          const message = asFriendlyMessage(status.message, "quickget-agent is unavailable. Start the agent and retry.");
          setErrorMessage(message);
          setAgentError(message);
          pushDiagnostic("agent", message, "error");
          return;
        }

        if (!isSupportedAgentApiVersion(status.api_version)) {
          setAgentState("failed");
          setConnectionStatus("failed");
          setErrorMessage(REQUIRED_AGENT_API_MESSAGE);
          setAgentError(REQUIRED_AGENT_API_MESSAGE);
          pushDiagnostic("agent", REQUIRED_AGENT_API_MESSAGE, "error", {
            apiVersion: status.api_version ?? "unknown",
          });
          return;
        }

        const downloads = await listDownloads();
        const captures = await listCaptures().catch(() => []);
        if (!active) return;
        replaceDownloads(downloads);
        const removedGhostIds = reconcileDownloads(downloads);
        if (removedGhostIds.length > 0) {
          pushDiagnostic("system", `Startup ghost cleanup removed ${removedGhostIds.length} stale row(s).`, "warn", {
            removedIds: removedGhostIds,
          });
        }
        replaceCaptures(captures);
        setAgentState("connected");
        setConnectionStatus("connected");
        pushDiagnostic("agent", `Agent connected. Loaded ${downloads.length} downloads.`);

        disconnectEvents = connectEvents(
          (event) => {
            applyEvent(event);
            setConnectionStatus("connected");
            if (event.type !== "download.progress") {
              pushDiagnostic("agent", `Event: ${event.type}`, "info", {
                downloadId: event.download_id ?? null,
                message: event.message ?? null,
              });
            }
            if (event.type === "capture.requested" || event.type === "capture.duplicate_found" || event.type === "capture.started" || event.type === "capture.rejected") {
              const captureId = event.capture_id ?? (typeof event.data?.capture_id === "string" ? event.data.capture_id : undefined);
              if (captureId) {
                void getCapture(captureId)
                  .then((capture) => {
                    upsertCapture(capture);
                    const currentSettings = settingsRef.current;
                    if ((event.type === "capture.requested" || event.type === "capture.duplicate_found") && currentSettings?.browserCapture.showMiniPopupOnCapture !== false) {
                      setActiveCapturePopup(capture.id);
                    }
                    if (event.type === "capture.started" || event.type === "capture.rejected") {
                      removeCapture(capture.id);
                    }
                  })
                  .catch(() => {});
              }
              if (event.type === "capture.started") {
                const startedDownloadId =
                  (typeof event.data?.download_id === "string" ? event.data.download_id : undefined) ??
                  (typeof event.data?.downloadId === "string" ? event.data.downloadId : undefined);
                if (startedDownloadId) {
                  setCaptureWindowDownloadId(startedDownloadId);
                  void getDownload(startedDownloadId)
                    .then((snapshot) => {
                      upsertDownload(snapshot);
                    })
                    .catch(() => {
                      void listDownloads()
                        .then((downloads) => {
                          replaceDownloads(downloads);
                          reconcileDownloads(downloads);
                        })
                        .catch(() => {});
                    });
                }
              }
              const currentSettings = settingsRef.current;
              if (
                event.type === "capture.requested" &&
                currentSettings?.browserCapture.openFullQdmOnCapture &&
                !currentSettings?.browserCapture.showMiniPopupOnCapture
              ) {
                void invoke("show_main_window");
              }
              if (
                event.type === "capture.requested" &&
                !isCapturePopupWindow &&
                currentSettings?.browserCapture.showMiniPopupOnCapture
              ) {
                void showCapturePopupWindow();
              }
              if (
                event.type === "capture.requested" &&
                !isCapturePopupWindow &&
                !currentSettings?.browserCapture.openFullQdmOnCapture &&
                currentSettings?.browserCapture.showMiniPopupOnCapture
              ) {
                void notifyCompletion("Browser download captured in QDM");
              }
            }

            if (event.type === AGENT_EVENT_DOWNLOAD_COMPLETED && event.download_id) {
              if (notifiedCompletions.current.has(event.download_id)) return;
              notifiedCompletions.current.add(event.download_id);
              const fileLabel = event.snapshot?.filename ?? event.download_id;
              const message = `${fileLabel} completed`;
              pushToast(message, "success");
              void notifyCompletion(message);
            }
            if (event.type === AGENT_EVENT_DOWNLOAD_FAILED && event.snapshot && settingsRef.current?.gentleRetryOnFailure) {
              const s = event.snapshot;
              void createDownload({
                url: s.url ?? "",
                output_dir: s.output_path ? s.output_path.replace(/[\\/][^\\/]+$/, "") : settingsRef.current?.defaultDownloadFolder ?? undefined,
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
            const friendly = asFriendlyMessage(message, "quickget-agent disconnected.");
            setConnectionStatus("disconnected");
            setAgentError(friendly);
            setErrorMessage(friendly);
            pushDiagnostic("agent", friendly, "error");
          }
        );
      } catch (error) {
        if (!active) return;
        setAgentState("failed");
        setConnectionStatus("failed");
        const message = toFriendlyErrorMessage(error, "Unable to connect to quickget-agent");
        setErrorMessage(message);
        setAgentError(message);
        pushDiagnostic("system", message, "error");
      }
    };

    void connect();
    return () => {
      active = false;
      if (disconnectEvents) disconnectEvents();
    };
  }, [isCapturePopupWindow]);

  useEffect(() => {
    void (async () => {
      try {
        setSettings(mergeWithDefaults(await getSettings()));
      } catch (error) {
        const message = toFriendlyErrorMessage(error, "Failed to load settings.");
        pushToast(`Failed to load settings: ${message}`, "error");
        setSettings(defaultSettings());
        pushDiagnostic("system", `Settings load fallback: ${message}`, "warn");
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
        reconcileDownloads(downloads);
        pushToast("All active downloads paused", "info");
      }),
      listen("tray://downloads-resumed", async () => {
        const downloads = await listDownloads();
        replaceDownloads(downloads);
        reconcileDownloads(downloads);
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
      setErrorMessage(mapFriendlyError(downloadsState.agentError) ?? downloadsState.agentError ?? "quickget-agent error");
    }
  }, [downloadsState.connectionStatus, downloadsState.agentError, agentState]);

  useEffect(() => {
    if (agentState !== "connected") {
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void listDownloads()
        .then((authoritative) => {
          if (cancelled) return;
          const removed = reconcileDownloads(authoritative);
          if (removed.length > 0) {
            pushDiagnostic("system", `Authoritative cleanup removed ${removed.length} stale row(s).`, "warn", {
              removedIds: removed,
            });
          }
        })
        .catch((error) => {
          if (cancelled) return;
          const message = toFriendlyErrorMessage(error, "Failed authoritative cleanup refresh.");
          pushDiagnostic("system", message, "warn");
        });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [agentState]);

  const onCreateDownload = async (request: CreateDownloadRequest) => {
    try {
      pushDiagnostic("ui", "Create download requested", "info", {
        url: request.url,
        hasCustomOutputDir: Boolean(request.output_dir),
      });
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
      pushDiagnostic("agent", `Download created: ${snapshot.id}`, "info");
      pushToast("Download added", "success");
    } catch (error) {
      const message = toFriendlyErrorMessage(error, "Download failed to create.");
      pushDiagnostic("agent", `Create download failed: ${message}`, "error");
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
      pushDiagnostic("ui", `Action succeeded for ${id}`, "info");
    } catch (error) {
      const message = toFriendlyErrorMessage(error, "Action failed.");
      setErrorMessage(message);
      setAgentError(message);
      pushDiagnostic("agent", `Action failed for ${id}: ${message}`, "error");
      pushToast(`Action failed: ${message}`, "error");
    } finally {
      markBusy(id, false);
    }
  };

  const onPause = async (id: string) => {
    pushDiagnostic("ui", `Pause requested for ${id}`);
    await runAction(id, async () => {
      const snapshot = await pauseDownload(id);
      upsertDownload(snapshot);
    });
  };

  const onResume = async (id: string) => {
    pushDiagnostic("ui", `Resume requested for ${id}`);
    await runAction(id, async () => {
      const snapshot = await resumeDownload(id);
      upsertDownload(snapshot);
    });
  };

  const onCancel = async (id: string) => {
    pushDiagnostic("ui", `Cancel requested for ${id}`);
    await runAction(id, async () => {
      const snapshot = await cancelDownload(id);
      upsertDownload(snapshot);
    });
  };

  const onDelete = async (id: string) => {
    pushDiagnostic("ui", `Delete requested for ${id}`);
    await runAction(id, async () => {
      await deleteDownload(id, false);
      const downloads = await listDownloads();
      replaceDownloads(downloads);
      reconcileDownloads(downloads);
    });
  };

  const onSettingsChange = async (next: AppSettings) => {
    setSettings(next);
    try {
      setSettingsBusy(true);
      const persisted = await saveSettings(next);
      setSettings(mergeWithDefaults(persisted));
      pushDiagnostic("ui", "Settings saved");
    } catch (error) {
      const message = toFriendlyErrorMessage(error, "Failed to save settings.");
      pushToast(`Failed to save settings: ${message}`, "error");
      pushDiagnostic("system", `Settings save failed: ${message}`, "error");
    } finally {
      setSettingsBusy(false);
    }
  };

  const activeCapture = capturesState.activeCapturePopup;
  const popupDownload = useMemo(() => {
    if (captureWindowDownloadId && downloadsState.byId[captureWindowDownloadId]) {
      return downloadsState.byId[captureWindowDownloadId];
    }
    return downloadsState.activeDownloads[0] ?? null;
  }, [captureWindowDownloadId, downloadsState.activeDownloads, downloadsState.byId]);

  useEffect(() => {
    if (!captureWindowDownloadId) return;
    const tracked = downloadsState.byId[captureWindowDownloadId];
    if (!tracked) {
      setCaptureWindowDownloadId(null);
    }
  }, [captureWindowDownloadId, downloadsState.byId]);

  useEffect(() => {
    if (!isCapturePopupWindow) {
      return;
    }
    if (activeCapture || popupDownload) {
      return;
    }
    const handle = window.setTimeout(() => {
      void invoke("hide_capture_popup_window").catch((error) => {
        const message = toFriendlyErrorMessage(error, "Failed to hide browser capture popup window.");
        pushDiagnostic("system", message, "warn");
      });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [isCapturePopupWindow, activeCapture, popupDownload]);

  useEffect(() => {
    if (isCapturePopupWindow) {
      return;
    }
    if (!settings?.browserCapture.showMiniPopupOnCapture) {
      return;
    }
    if (capturesState.pending.length === 0) {
      return;
    }
    void showCapturePopupWindow();
  }, [capturesState.pending.length, isCapturePopupWindow, settings?.browserCapture.showMiniPopupOnCapture]);

  const runCaptureAction = async (captureId: string, action: () => Promise<void>) => {
    try {
      setCaptureBusyId(captureId);
      await action();
    } catch (error) {
      const message = toFriendlyErrorMessage(error, "Capture action failed.");
      pushToast(message, "error");
      if (settingsRef.current?.browserCapture.openFullQdmOnError) {
        await invoke("show_main_window");
      }
    } finally {
      setCaptureBusyId(null);
    }
  };

  const onStartCapture = async (captureId: string, request: { output_dir?: string; filename?: string; speed_mode?: "auto" | "manual"; duplicate_action?: "overwrite" | "new_name" }) => {
    await runCaptureAction(captureId, async () => {
      await startCaptureDownload(captureId, request);
      removeCapture(captureId);
      const downloads = await listDownloads();
      replaceDownloads(downloads);
      reconcileDownloads(downloads);
      pushToast("Capture started", "success");
    });
  };

  const onRejectCapture = async (captureId: string) => {
    await runCaptureAction(captureId, async () => {
      await rejectCapture(captureId);
      removeCapture(captureId);
      pushToast("Capture rejected", "info");
    });
  };

  const onShowCaptureExisting = async (captureId: string) => {
    const capture = capturesState.byId[captureId];
    const existingPath = capture?.duplicate?.existing_path;
    if (!existingPath) return;
    await runCaptureAction(captureId, async () => {
      const exists = await fileExists(existingPath).catch(() => false);
      if (exists) {
        await openDownloadFile(existingPath).catch(async () => openDownloadFolder(existingPath));
        await rejectCapture(captureId).catch(() => {});
        removeCapture(captureId);
        return;
      }

      await startCaptureDownload(captureId, {
        output_dir: capture?.output_dir ?? settingsRef.current?.defaultDownloadFolder ?? undefined,
        filename: capture?.suggested_filename,
        speed_mode: settingsRef.current?.speedMode ?? "auto",
      });
      removeCapture(captureId);
      const downloads = await listDownloads();
      replaceDownloads(downloads);
      reconcileDownloads(downloads);
      pushToast("Existing file was missing. Started download instead.", "info");
    });
  };

  const onRefreshProfilerStatus = async () => {
    const available = await checkProfilerApiAvailable();
    if (!settings) return;
    let recommendation = settings.profiler.recommendation;
    let artifacts = settings.profiler.artifacts ?? null;
    let status = settings.profiler.status;
    let runId = settings.profiler.runId ?? null;
    const message = available ? "Profiler API detected." : "Profiler integration requires quickget-agent profiler API.";
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
      const message = toFriendlyErrorMessage(error, "Profiler failed.");
      await onSettingsChange({
        ...settings,
        profiler: {
          ...settings.profiler,
          status: "error",
          lastError: message,
          message,
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
      const message = toFriendlyErrorMessage(error, "Profiler cancellation failed.");
      await onSettingsChange({
        ...settings,
        profiler: {
          ...settings.profiler,
          status: "error",
          lastError: message,
          message,
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
      pushDiagnostic("ui", `Quit action executed: ${action}`);
    } catch (error) {
      const message = toFriendlyErrorMessage(error, "Quit action failed.");
      pushDiagnostic("system", `Quit action failed: ${message}`, "error");
      pushToast(`Quit action failed: ${message}`, "error");
    } finally {
      setQuitBusy(false);
    }
  };

  const onCopyDiagnostics = async () => {
    try {
      const report = formatDiagnosticsReport({
        appName: APP_NAME,
        appVersion: APP_VERSION,
        agentState,
        agentVersion: agentStatus?.version,
        agentApiVersion: agentStatus?.api_version,
        frontendBuildCommit: FRONTEND_BUILD_COMMIT,
        frontendBuildTime: FRONTEND_BUILD_TIME,
        backendBuildCommit: runtimeBuildInfo?.backend_build_commit ?? null,
        backendBuildUnix: runtimeBuildInfo?.backend_build_unix ?? null,
        diagnostics,
      });
      await navigator.clipboard.writeText(report);
      pushToast("Diagnostics copied", "success");
      pushDiagnostic("ui", "Diagnostics copied to clipboard");
    } catch (error) {
      const message = toFriendlyErrorMessage(error, "Could not copy diagnostics.");
      pushToast(message, "error");
      pushDiagnostic("ui", `Diagnostics copy failed: ${message}`, "error");
    }
  };

  return (
    <>
      {isCapturePopupWindow ? (
        <BrowserCapturePopup
          mode="window"
          capture={activeCapture}
          activeDownload={popupDownload}
          defaultOutputDir={settings?.defaultDownloadFolder ?? null}
          defaultSpeedMode={settings?.speedMode ?? "auto"}
          busy={activeCapture ? captureBusyId === activeCapture.id : false}
          onStart={(request) => (activeCapture ? onStartCapture(activeCapture.id, request) : Promise.resolve())}
          onReject={() => (activeCapture ? onRejectCapture(activeCapture.id) : Promise.resolve())}
          onOpenFullQdm={() => invoke("show_main_window")}
          onClosePopup={() => invoke("hide_capture_popup_window")}
          onShowExisting={() => (activeCapture ? onShowCaptureExisting(activeCapture.id) : Promise.resolve())}
          onPauseDownload={onPause}
          onResumeDownload={onResume}
          onCancelDownload={onCancel}
        />
      ) : null}
      {!isCapturePopupWindow ? (
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
            appVersion={APP_VERSION}
            runtimeBuildInfo={runtimeBuildInfo}
            frontendBuildCommit={FRONTEND_BUILD_COMMIT}
            frontendBuildTime={FRONTEND_BUILD_TIME}
            diagnostics={diagnostics}
            onCopyDiagnostics={onCopyDiagnostics}
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
      ) : null}
    </>
  );
}
