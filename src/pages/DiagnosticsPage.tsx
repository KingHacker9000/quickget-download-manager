import type { DiagnosticEntry } from "../utils/diagnostics";

type Props = {
  diagnostics: DiagnosticEntry[];
  onCopyDiagnostics: () => Promise<void>;
  frontendBuildCommit: string;
  frontendBuildTime: string;
  backendBuildCommit?: string | null;
  backendBuildUnix?: string | null;
};

function levelClass(level: DiagnosticEntry["level"]): string {
  if (level === "error") return "text-rose-300";
  if (level === "warn") return "text-amber-300";
  return "text-cyan-300";
}

function formatUnixSeconds(raw?: string | null): string {
  const secs = Number(raw ?? "");
  if (!Number.isFinite(secs) || secs <= 0) return "unknown";
  return new Date(secs * 1000).toISOString();
}

export function DiagnosticsPage({
  diagnostics,
  onCopyDiagnostics,
  frontendBuildCommit,
  frontendBuildTime,
  backendBuildCommit,
  backendBuildUnix,
}: Props) {
  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Diagnostics</h2>
          <p className="text-xs text-slate-400">Recent agent and UI events (sensitive headers and tokens are redacted).</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Frontend: {frontendBuildCommit} @ {frontendBuildTime} | Backend: {backendBuildCommit ?? "unknown"} @ {formatUnixSeconds(backendBuildUnix)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onCopyDiagnostics()}
          className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
          aria-label="Copy diagnostics report"
        >
          Copy Diagnostics
        </button>
      </header>

      <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
        {diagnostics.length === 0 ? (
          <p className="text-sm text-slate-500">No diagnostics events captured yet.</p>
        ) : (
          <ul className="space-y-2">
            {diagnostics.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-500">{entry.at}</span>
                  <span className={`font-semibold uppercase tracking-[0.12em] ${levelClass(entry.level)}`}>{entry.level}</span>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">{entry.source}</span>
                </div>
                <p className="mt-1 text-slate-200">{entry.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
