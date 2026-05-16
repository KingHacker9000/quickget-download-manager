import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AGENT_EVENT_DOWNLOAD_COMPLETED,
  type AgentConnectionState,
  type AgentStatus,
  type CreateDownloadRequest,
} from "./types/agent";
import {
  cancelDownload,
  connectEvents,
  createDownload,
  deleteDownload,
  listDownloads,
  pauseDownload,
  resumeDownload,
} from "./api/agentClient";
import {
  applyEvent,
  replaceDownloads,
  setAgentError,
  setConnectionStatus,
  upsertDownload,
  useDownloadsStore,
} from "./state/downloadsStore";
import { DownloadsPage } from "./pages/DownloadsPage";
import { Toasts, type ToastItem, type ToastTone } from "./components/Toasts";

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
      let snapshot;
      try {
        snapshot = await createDownload(request);
      } catch (error) {
        const message = getErrorMessage(error).toLowerCase();
        const shouldRetryWithoutMetadata =
          message.includes("invalid json body") && !!request.metadata && Object.keys(request.metadata).length > 0;
        if (!shouldRetryWithoutMetadata) throw error;
        snapshot = await createDownload({
          url: request.url,
          output_dir: request.output_dir,
          filename: request.filename,
          headers: request.headers,
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

  return (
    <>
      <DownloadsPage
        agentState={agentState}
        agentStatus={agentStatus}
        errorMessage={errorMessage}
        activeDownloads={downloadsState.activeDownloads}
        completedDownloads={downloadsState.completedDownloads}
        busyIds={busyIds}
        onCreateDownload={onCreateDownload}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onDelete={onDelete}
      />
      <Toasts items={toasts} onDismiss={dismissToast} />
    </>
  );
}
