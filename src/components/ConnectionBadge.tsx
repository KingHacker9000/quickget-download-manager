import type { AgentConnectionState, AgentStatus } from "../types/agent";

type Props = {
  state: AgentConnectionState;
  status: AgentStatus | null;
  errorMessage: string | null;
};

export function ConnectionBadge({ state, status, errorMessage }: Props) {
  const dotClass =
    state === "connected"
      ? "bg-emerald-500"
      : state === "failed"
        ? "bg-rose-500"
        : state === "disconnected"
          ? "bg-slate-500"
          : "bg-amber-500";
  const message =
    state === "connected"
      ? `Connected to quickget-agent at ${status?.base_url ?? "localhost"}`
      : state === "failed"
        ? `Failed to connect: ${errorMessage ?? "unknown error"}`
        : state === "disconnected"
          ? "quickget-agent disconnected"
        : "Starting quickget-agent...";

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-surface px-4 py-2 text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      {message}
    </div>
  );
}
