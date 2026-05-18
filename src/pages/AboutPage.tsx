import { APP_NAME, QDM_REPO_URL, QUICKGET_REPO_URL } from "../constants/appInfo";
import type { AgentStatus } from "../types/agent";

type Props = {
  appVersion: string;
  agentStatus: AgentStatus | null;
};

function valueOrUnknown(value?: string | null): string {
  return value && value.trim() ? value : "unknown";
}

export function AboutPage({ appVersion, agentStatus }: Props) {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-100">About</h2>
        <p className="text-xs text-slate-400">Desktop UI for QuickGet downloads.</p>
      </header>

      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">App name</dt>
            <dd className="text-slate-100">{APP_NAME}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Version</dt>
            <dd className="text-slate-100">{appVersion}</dd>
          </div>
          <div>
            <dt className="text-slate-500">QuickGet Agent version</dt>
            <dd className="text-slate-100">{valueOrUnknown(agentStatus?.version)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">API version</dt>
            <dd className="text-slate-100">{valueOrUnknown(agentStatus?.api_version)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4 text-sm">
        <p className="text-slate-300">Repositories</p>
        <ul className="mt-2 space-y-1 text-cyan-300">
          <li>
            <a href={QUICKGET_REPO_URL} target="_blank" rel="noreferrer" className="underline decoration-cyan-500/60 underline-offset-2">
              quickget
            </a>
          </li>
          <li>
            <a href={QDM_REPO_URL} target="_blank" rel="noreferrer" className="underline decoration-cyan-500/60 underline-offset-2">
              quickget-download-manager
            </a>
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4 text-xs text-slate-300">
        <p><span className="text-slate-500">Platform support:</span> Windows-first desktop release.</p>
        <p className="mt-1 text-slate-400">macOS/Linux artifacts may exist but remain experimental and untested.</p>
      </div>
    </section>
  );
}
