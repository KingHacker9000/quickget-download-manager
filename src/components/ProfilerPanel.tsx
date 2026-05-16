import { SettingsSection } from "./SettingsSection";
import type { AppSettings, EffectiveQuickGetOptions } from "../types/settings";

type Props = {
  settings: AppSettings;
  effective: EffectiveQuickGetOptions | null;
  busy?: boolean;
  onRunProfiler: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
};

export function ProfilerPanel({ settings, effective, busy, onRunProfiler, onRefreshStatus }: Props) {
  const profiler = settings.profiler;

  return (
    <SettingsSection title="Profiler" description="Generate recommendations based on quickget-agent profile runs.">
      {profiler.apiAvailable === false ? (
        <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
          Profiler integration requires quickget-agent profiler API.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200" onClick={() => void onRefreshStatus()}>
          Check API
        </button>
        <button type="button" disabled={busy || profiler.apiAvailable === false || profiler.status === "running"} className="rounded-lg border border-cyan-600/60 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50" onClick={() => void onRunProfiler()}>
          {profiler.status === "running" ? "Running..." : "Run profiler"}
        </button>
      </div>
      {profiler.message ? <p className="text-xs text-slate-400">{profiler.message}</p> : null}
      {effective ? (
        <p className="text-xs text-slate-400">
          Effective new-download options: n={effective.connections}, queue={String(effective.queueMode)}, segment={effective.segmentSize}, buffer={effective.bufferSize}.
        </p>
      ) : null}
    </SettingsSection>
  );
}
