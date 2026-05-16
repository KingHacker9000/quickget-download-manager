import { SettingsSection } from "./SettingsSection";
import type { AppSettings, HeaderEntry, SettingsValidationErrors } from "../types/settings";

type Props = {
  settings: AppSettings;
  errors: SettingsValidationErrors;
  disabled?: boolean;
  onChange: (next: AppSettings) => void;
};

function updateHeader(headers: HeaderEntry[], index: number, patch: Partial<HeaderEntry>): HeaderEntry[] {
  return headers.map((header, i) => (i === index ? { ...header, ...patch } : header));
}

export function AdvancedQuickGetSettings({ settings, errors, disabled, onChange }: Props) {
  const adv = settings.advanced;
  const setNumber = (key: keyof typeof adv, value: string) => {
    const parsed = Number(value || 0);
    onChange({ ...settings, advanced: { ...adv, [key]: Number.isFinite(parsed) ? parsed : 0 } });
  };

  return (
    <SettingsSection
      title="Advanced QuickGet Settings"
      description="Power-user controls. These settings are applied to newly created downloads."
    >
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Custom headers may include secrets (for example Authorization tokens). Avoid sharing screenshots/logs with visible values.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-400"><span>connections</span><input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.connections} disabled={disabled} onChange={(e) => setNumber("connections", e.target.value)} placeholder="connections" /></label>
        <label className="space-y-1 text-xs text-slate-400"><span>retries</span><input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.retries} disabled={disabled} onChange={(e) => setNumber("retries", e.target.value)} placeholder="retries" /></label>
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.segmentSize} disabled={disabled} onChange={(e) => setNumber("segmentSize", e.target.value)} placeholder="segment size" />
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.bufferSize} disabled={disabled} onChange={(e) => setNumber("bufferSize", e.target.value)} placeholder="buffer size" />
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.maxIdleConnections} disabled={disabled} onChange={(e) => setNumber("maxIdleConnections", e.target.value)} placeholder="max idle connections" />
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.idleTimeoutSeconds} disabled={disabled} onChange={(e) => setNumber("idleTimeoutSeconds", e.target.value)} placeholder="idle timeout (sec)" />
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.minSplitSize} disabled={disabled} onChange={(e) => setNumber("minSplitSize", e.target.value)} placeholder="min split size" />
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" type="number" value={adv.minDynamicFileSize} disabled={disabled} onChange={(e) => setNumber("minDynamicFileSize", e.target.value)} placeholder="min dynamic file size" />
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={adv.writeDiskStatsTarget} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, writeDiskStatsTarget: e.target.value } })} placeholder="write disk stats target" />
        <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={adv.userAgent} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, userAgent: e.target.value } })} placeholder="user agent" />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={adv.queueMode} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, queueMode: e.target.checked } })} />Queue mode</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={adv.dynamicSplitting} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, dynamicSplitting: e.target.checked } })} />Dynamic splitting</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={adv.autoBuffer} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, autoBuffer: e.target.checked } })} />Auto buffer</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={adv.forceHttp1} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, forceHttp1: e.target.checked } })} />Force HTTP/1</label>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Custom headers</p>
        {adv.customHeaders.map((header, index) => (
          <div key={`${index}-${header.key}`} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={header.key} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, customHeaders: updateHeader(adv.customHeaders, index, { key: e.target.value }) } })} placeholder="Header" />
            <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={header.value} disabled={disabled} onChange={(e) => onChange({ ...settings, advanced: { ...adv, customHeaders: updateHeader(adv.customHeaders, index, { value: e.target.value }) } })} placeholder="Value" />
            <button type="button" className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200" onClick={() => onChange({ ...settings, advanced: { ...adv, customHeaders: adv.customHeaders.filter((_, i) => i !== index) } })}>Remove</button>
          </div>
        ))}
        <button type="button" className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200" onClick={() => onChange({ ...settings, advanced: { ...adv, customHeaders: [...adv.customHeaders, { key: "", value: "" }] } })}>
          Add Header
        </button>
      </div>
      {Object.values(errors).length > 0 ? (
        <p className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {Object.values(errors)[0]}
        </p>
      ) : null}
    </SettingsSection>
  );
}
