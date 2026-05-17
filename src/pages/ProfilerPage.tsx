import { useState } from "react";
import type { RunProfilerRequest } from "../api/agentClient";
import type { AppSettings } from "../types/settings";

type Props = {
  settings: AppSettings | null;
  busy: boolean;
  onRunProfiler: (request?: RunProfilerRequest) => Promise<void>;
  onCancelProfiler: () => Promise<void>;
  onRefreshProfilerStatus: () => Promise<void>;
  onRestoreRecommended: () => void;
};

export function ProfilerPage({ settings, busy, onRunProfiler, onCancelProfiler, onRefreshProfilerStatus, onRestoreRecommended }: Props) {
  const [level, setLevel] = useState<"quick" | "normal" | "exhaustive">("normal");
  const [sizes, setSizes] = useState("10MB,100MB,1GB");
  const [repeats, setRepeats] = useState(3);
  const [url, setURL] = useState("");

  if (!settings) {
    return <div className="text-sm text-slate-400">Loading profiler...</div>;
  }

  const profiler = settings.profiler;
  const recommendation = profiler.recommendation;
  const logs = profiler.liveLogs ?? [];
  const stageText = profiler.liveStage ? `${profiler.liveStage}${profiler.liveStepIndex != null && profiler.liveStepTotal != null ? ` (${profiler.liveStepIndex}/${profiler.liveStepTotal})` : ""}` : "idle";

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-100">Profiler</h2>
        <p className="mt-1 text-xs text-slate-400">Run quickget-agent profiling and watch live progress updates.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-600 px-2 py-1 text-xs text-slate-300">API: {profiler.apiAvailable ? "available" : "missing"}</span>
        <span className="rounded-full border border-slate-600 px-2 py-1 text-xs text-slate-300">Status: {profiler.status}</span>
        <span className="rounded-full border border-slate-600 px-2 py-1 text-xs text-slate-300">Stage: {stageText}</span>
      </div>

      <div className="flex gap-2">
        <button type="button" disabled={busy} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200" onClick={() => void onRefreshProfilerStatus()}>
          Check API
        </button>
        <button
          type="button"
          disabled={busy || profiler.apiAvailable === false || profiler.status === "running"}
          className="rounded-lg border border-cyan-600/60 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50"
          onClick={() => void onRunProfiler({ level, sizes, repeats, url: url.trim() || undefined })}
        >
          {profiler.status === "running" ? "Running..." : "Run profiler"}
        </button>
        <button
          type="button"
          disabled={busy || profiler.status !== "running"}
          className="rounded-lg border border-rose-600/60 px-3 py-2 text-xs text-rose-200 disabled:opacity-50"
          onClick={() => void onCancelProfiler()}
        >
          Cancel run
        </button>
        <button type="button" disabled={!recommendation} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-50" onClick={onRestoreRecommended}>
          Apply recommendation
        </button>
      </div>

      {profiler.message ? <p className="text-xs text-slate-400">{profiler.message}</p> : null}
      {profiler.lastError ? <p className="rounded-lg border border-rose-500/60 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">{profiler.lastError}</p> : null}

      <section className="grid gap-2 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 md:grid-cols-4">
        <label className="text-xs text-slate-300">
          Level
          <select className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" value={level} onChange={(e) => setLevel(e.target.value as "quick" | "normal" | "exhaustive")}>
            <option value="quick">quick</option>
            <option value="normal">normal</option>
            <option value="exhaustive">exhaustive</option>
          </select>
        </label>
        <label className="text-xs text-slate-300">
          Sizes (CSV)
          <input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="10MB,100MB,1GB" />
        </label>
        <label className="text-xs text-slate-300">
          Repeats
          <input type="number" min={1} max={20} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" value={repeats} onChange={(e) => setRepeats(Math.max(1, Number(e.target.value || 1)))} />
        </label>
        <label className="text-xs text-slate-300">
          URL (optional)
          <input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" value={url} onChange={(e) => setURL(e.target.value)} placeholder="https://..." />
        </label>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Live logs</p>
        <div className="max-h-64 overflow-auto rounded-lg border border-slate-800 bg-black/30 p-2 font-mono text-xs text-slate-300">
          {logs.length === 0 ? <p className="text-slate-500">No profiler logs yet.</p> : logs.map((line, idx) => <p key={`${idx}-${line.slice(0, 16)}`}>{line}</p>)}
        </div>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 text-xs text-slate-300">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Latest recommendation</p>
        {recommendation ? (
          <p>
            n={recommendation.connections}, queue={String(recommendation.queueMode)}, segment={recommendation.segmentSize}, buffer={recommendation.bufferSize}, http1={String(recommendation.forceHttp1)}
          </p>
        ) : (
          <p className="text-slate-500">No recommendation yet.</p>
        )}
        {profiler.artifacts ? (
          <div className="mt-2 space-y-1 text-slate-400">
            <p>Profile dir: {profiler.artifacts.profileDir ?? "-"}</p>
            <p>Raw CSV: {profiler.artifacts.rawCsv ?? "-"}</p>
            <p>Summary CSV: {profiler.artifacts.summaryCsv ?? "-"}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
