import { useMemo, useState } from "react";
import { SettingsSection } from "../components/SettingsSection";
import { SpeedPresetSelector } from "../components/SpeedPresetSelector";
import { AdvancedQuickGetSettings } from "../components/AdvancedQuickGetSettings";
import { ProfilerPanel } from "../components/ProfilerPanel";
import {
  getEffectiveQuickGetOptions,
  hasAdvancedValidationErrors,
  resetSettingsDefaults,
  validateAdvancedSettings,
} from "../state/settingsStore";
import type { RunProfilerRequest } from "../api/agentClient";
import type { AppSettings } from "../types/settings";

type Props = {
  settings: AppSettings | null;
  busy: boolean;
  onChange: (next: AppSettings) => void;
  onRunProfiler: (request?: RunProfilerRequest) => Promise<void>;
  onRefreshProfilerStatus: () => Promise<void>;
  onRestoreRecommended: () => void;
  onOpenProfilerTab?: () => void;
};

export function SettingsPage({ settings, busy, onChange, onRunProfiler, onRefreshProfilerStatus, onRestoreRecommended, onOpenProfilerTab }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const errors = useMemo(() => (settings ? validateAdvancedSettings(settings) : {}), [settings]);
  const effective = useMemo(() => (settings ? getEffectiveQuickGetOptions(settings) : null), [settings]);

  if (!settings) {
    return <div className="text-sm text-slate-400">Loading settings...</div>;
  }

  const hasRec = !!settings.profiler.recommendation;

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
        <p className="mt-1 text-xs text-slate-400">Presets for most users, advanced flags for power users.</p>
      </header>

      <SettingsSection
        title="General"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
              onClick={() => onChange(resetSettingsDefaults(settings))}
            >
              Reset to Defaults
            </button>
            <button
              type="button"
              disabled={busy || !hasRec}
              className="rounded-lg border border-cyan-600/60 px-3 py-1.5 text-xs text-cyan-200 disabled:opacity-50"
              onClick={onRestoreRecommended}
            >
              Restore Recommended
            </button>
          </div>
        }
      >
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={settings.launchOnStartup} disabled={busy} onChange={(e) => onChange({ ...settings, launchOnStartup: e.target.checked })} />Launch on startup</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={settings.notificationsEnabled} disabled={busy} onChange={(e) => onChange({ ...settings, notificationsEnabled: e.target.checked })} />Notifications enabled</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={settings.minimizeToTrayOnClose} disabled={busy} onChange={(e) => onChange({ ...settings, minimizeToTrayOnClose: e.target.checked })} />Minimize to tray on close</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={settings.gentleRetryOnFailure} disabled={busy} onChange={(e) => onChange({ ...settings, gentleRetryOnFailure: e.target.checked })} />Gentle retry when download fails</label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Default download folder</span>
          <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={settings.defaultDownloadFolder ?? ""} disabled={busy} onChange={(e) => onChange({ ...settings, defaultDownloadFolder: e.target.value || null })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Max simultaneous downloads</span>
          <input type="number" min={1} className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={settings.maxSimultaneousDownloads} disabled={busy} onChange={(e) => onChange({ ...settings, maxSimultaneousDownloads: Math.max(1, Number(e.target.value || 1)) })} />
        </label>
      </SettingsSection>

      <SettingsSection title="Speed preset" description="These presets control how QuickGet flags are applied when new downloads are created.">
        <SpeedPresetSelector value={settings.speedMode} disabled={busy} onChange={(speedMode) => onChange({ ...settings, speedMode })} />
      </SettingsSection>

      <ProfilerPanel
        settings={settings}
        effective={effective}
        busy={busy}
        onRunProfiler={onRunProfiler}
        onRefreshStatus={onRefreshProfilerStatus}
        onOpenProfilerTab={onOpenProfilerTab}
      />

      <SettingsSection title="Advanced" description="Raw QuickGet flags for power users.">
        <button type="button" className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? "Hide advanced settings" : "Show advanced settings"}
        </button>
      </SettingsSection>

      {advancedOpen ? <AdvancedQuickGetSettings settings={settings} errors={errors} disabled={busy} onChange={onChange} /> : null}

      {hasAdvancedValidationErrors(settings) ? (
        <p className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">Some advanced values are invalid. Fix them before creating new downloads.</p>
      ) : null}
    </div>
  );
}
