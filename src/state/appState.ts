import type { AgentConnectionState, AgentStatus } from "../types/agent";

export const appState: {
  agentState: AgentConnectionState;
  agentStatus: AgentStatus | null;
  errorMessage: string | null;
} = {
  agentState: "starting",
  agentStatus: null,
  errorMessage: null,
};
