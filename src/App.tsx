import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HomePage } from "./pages/HomePage";
import type { AgentConnectionState, AgentStatus } from "./types/agent";
import { connectEvents, listDownloads } from "./api/agentClient";
import {
  applyEvent,
  replaceDownloads,
  setAgentError,
  setConnectionStatus,
  useDownloadsStore,
} from "./state/downloadsStore";

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

export default function App() {
  const [agentState, setAgentState] = useState<AgentConnectionState>("starting");
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const downloadsState = useDownloadsStore();

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

    connect();
    return () => {
      active = false;
      if (disconnectEvents) disconnectEvents();
    };
  }, []);

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

  return <HomePage agentState={agentState} agentStatus={agentStatus} errorMessage={errorMessage} />;
}
