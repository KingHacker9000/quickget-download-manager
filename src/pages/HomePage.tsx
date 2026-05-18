import { ConnectionBadge } from "../components/ConnectionBadge";
import type { AgentConnectionState, AgentStatus } from "../types/agent";

type Props = {
  agentState: AgentConnectionState;
  agentStatus: AgentStatus | null;
  errorMessage: string | null;
};

export function HomePage({ agentState, agentStatus, errorMessage }: Props) {
  return (
    <main className="min-h-screen p-8 text-ink">
      <section className="mx-auto mt-10 max-w-3xl rounded-3xl bg-panel/90 p-8 shadow-glass backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">QDM v0.1.0</p>
        <h1 className="mt-2 text-3xl font-bold">QuickGet Download Manager</h1>
        <p className="mt-3 text-sm text-slate-600">
          Windows-first desktop UI for QuickGet. Downloads are managed by quickget-agent in the QuickGet CLI/backend repo.
        </p>
        <div className="mt-6">
          <ConnectionBadge state={agentState} status={agentStatus} errorMessage={errorMessage} />
        </div>
      </section>
    </main>
  );
}
