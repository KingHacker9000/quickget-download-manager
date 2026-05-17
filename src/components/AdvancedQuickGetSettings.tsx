import { SettingsSection } from "./SettingsSection";
import type { AppSettings, HeaderEntry, SettingsValidationErrors } from "../types/settings";

type Props = {
  settings: AppSettings;
  errors: SettingsValidationErrors;
  disabled?: boolean;
  onChange: (next: AppSettings) => void;
};

type AdvancedNumberKey =
  | "connections"
  | "retries"
  | "segmentSize"
  | "bufferSize"
  | "maxIdleConnections"
  | "idleTimeoutSeconds"
  | "minSplitSize"
  | "minDynamicFileSize";

function updateHeader(headers: HeaderEntry[], index: number, patch: Partial<HeaderEntry>): HeaderEntry[] {
  return headers.map((header, i) => (i === index ? { ...header, ...patch } : header));
}

function parseSizeInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kmgt]?b)?$/i);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  const multiplier = multipliers[unit];
  return Number.isFinite(amount) && multiplier ? Math.round(amount * multiplier) : Number.NaN;
}

export function AdvancedQuickGetSettings({ settings, errors, disabled, onChange }: Props) {
  const adv = settings.advanced;
  const setNumber = (key: AdvancedNumberKey, value: string, parseAsSize = false) => {
    const parsed = parseAsSize ? parseSizeInput(value) : Number(value || 0);
    onChange({ ...settings, advanced: { ...adv, [key]: Number.isFinite(parsed) ? parsed : 0 } });
  };

  const renderNumberField = (
    key: AdvancedNumberKey,
    label: string,
    placeholder: string,
    parseAsSize = false,
  ) => (
    <label className="space-y-1 text-xs text-slate-400">
      <span>{label}</span>
      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
        type={parseAsSize ? "text" : "number"}
        value={adv[key]}
        disabled={disabled}
        onChange={(e) => setNumber(key, e.target.value, parseAsSize)}
        placeholder={placeholder}
      />
    </label>
  );

  const setString = (key: "writeDiskStatsTarget" | "userAgent", value: string) => {
    onChange({ ...settings, advanced: { ...adv, [key]: value } });
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
        {renderNumberField("connections", "Connections", "e.g. 16")}
        {renderNumberField("retries", "Retries", "e.g. 3")}
        {renderNumberField("segmentSize", "Segment Size (bytes; supports KB/MB/GB)", "e.g. 8MB", true)}
        {renderNumberField("bufferSize", "Buffer Size (bytes; supports KB/MB/GB)", "e.g. 1MB", true)}
        {renderNumberField("maxIdleConnections", "Max Idle Connections", "e.g. 32")}
        {renderNumberField("idleTimeoutSeconds", "Idle Timeout (seconds)", "e.g. 30")}
        {renderNumberField("minSplitSize", "Min Split Size (bytes; supports KB/MB/GB)", "e.g. 16MB", true)}
        {renderNumberField("minDynamicFileSize", "Min Dynamic File Size (bytes; supports KB/MB/GB)", "e.g. 64MB", true)}
        <label className="space-y-1 text-xs text-slate-400">
          <span>Write Disk Stats Target</span>
          <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={adv.writeDiskStatsTarget} disabled={disabled} onChange={(e) => setString("writeDiskStatsTarget", e.target.value)} placeholder="write disk stats target" />
        </label>
        <label className="space-y-1 text-xs text-slate-400">
          <span>User Agent</span>
          <input className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" value={adv.userAgent} disabled={disabled} onChange={(e) => setString("userAgent", e.target.value)} placeholder="user agent" />
        </label>
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
