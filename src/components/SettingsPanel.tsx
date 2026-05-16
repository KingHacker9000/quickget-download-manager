import type { AppSettings } from "../types/settings";

type Props = {
  settings: AppSettings | null;
  busy: boolean;
  onChange: (next: AppSettings) => void;
};

export function SettingsPanel({ settings, busy, onChange }: Props) {
  if (!settings) {
    return <div className="text-sm text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
      <label className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/30 px-4 py-3">
        <span className="text-sm text-slate-200">Launch on startup</span>
        <input
          type="checkbox"
          checked={settings.launchOnStartup}
          disabled={busy}
          onChange={(e) => onChange({ ...settings, launchOnStartup: e.target.checked })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Default download folder</span>
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          value={settings.defaultDownloadFolder ?? ""}
          disabled={busy}
          onChange={(e) => onChange({ ...settings, defaultDownloadFolder: e.target.value || null })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Speed mode</span>
        <select
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          value={settings.speedMode}
          disabled={busy}
          onChange={(e) => onChange({ ...settings, speedMode: e.target.value })}
        >
          <option value="gentle">Gentle</option>
          <option value="balanced">Balanced</option>
          <option value="aggressive">Aggressive</option>
          <option value="auto">Auto</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Max simultaneous downloads</span>
        <input
          type="number"
          min={1}
          max={64}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          value={settings.maxSimultaneousDownloads}
          disabled={busy}
          onChange={(e) =>
            onChange({
              ...settings,
              maxSimultaneousDownloads: Math.max(1, Math.min(64, Number(e.target.value || 1))),
            })
          }
        />
      </label>
      <label className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/30 px-4 py-3">
        <span className="text-sm text-slate-200">Notifications enabled</span>
        <input
          type="checkbox"
          checked={settings.notificationsEnabled}
          disabled={busy}
          onChange={(e) => onChange({ ...settings, notificationsEnabled: e.target.checked })}
        />
      </label>
    </div>
  );
}
