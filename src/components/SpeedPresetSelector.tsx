import type { SpeedMode } from "../types/settings";

type Props = {
  value: SpeedMode;
  disabled?: boolean;
  onChange: (next: SpeedMode) => void;
};

const PRESETS: Array<{ id: SpeedMode; label: string; desc: string }> = [
  { id: "auto", label: "Auto", desc: "Use profiler recommendation when available, otherwise safe defaults." },
  { id: "manual", label: "Manual", desc: "Use the advanced values exactly as configured." },
];

export function SpeedPresetSelector({ value, disabled, onChange }: Props) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {PRESETS.map((preset) => {
        const active = preset.id === value;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.id)}
            className={[
              "rounded-xl border px-3 py-3 text-left transition",
              active
                ? "border-cyan-400/50 bg-cyan-500/15 text-slate-100"
                : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-slate-600",
            ].join(" ")}
          >
            <p className="text-sm font-semibold">{preset.label}</p>
            <p className="mt-1 text-xs text-slate-400">{preset.desc}</p>
          </button>
        );
      })}
    </div>
  );
}
