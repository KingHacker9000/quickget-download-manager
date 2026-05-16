import { useMemo, useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { CreateDownloadRequest } from "../types/agent";

export type SpeedMode = "Auto" | "Balanced" | "Aggressive" | "Gentle";

type Props = {
  canSubmit: boolean;
  defaultOutputDir?: string;
  maxSimultaneousAvailable?: number | null;
  onSubmit: (request: CreateDownloadRequest) => Promise<void>;
};

const speedOptions: SpeedMode[] = ["Auto", "Balanced", "Aggressive", "Gentle"];

export function AddDownloadForm({ canSubmit, defaultOutputDir, maxSimultaneousAvailable, onSubmit }: Props) {
  const [url, setUrl] = useState("");
  const [outputDir, setOutputDir] = useState(defaultOutputDir ?? "");
  const [speedMode, setSpeedMode] = useState<SpeedMode>("Auto");
  const [maxSimultaneous, setMaxSimultaneous] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedConcurrent = useMemo(() => {
    if (!maxSimultaneous.trim()) return undefined;
    const parsed = Number.parseInt(maxSimultaneous, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }, [maxSimultaneous]);

  const pickOutputFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select download folder" });
      if (typeof selected === "string") {
        setOutputDir(selected);
      }
    } catch {
      setError("Folder picker unavailable. Enter output path manually.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a valid URL to start download.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        url: trimmed,
        output_dir: outputDir.trim() || undefined,
        metadata: {
          speed_mode: speedMode.toLowerCase(),
          ...(parsedConcurrent ? { max_simultaneous_downloads: parsedConcurrent } : {}),
        },
      });
      setUrl("");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Could not start download";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">Add Download</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/file.zip"
          className="col-span-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-accent/30 placeholder:text-slate-400 focus:ring"
        />

        <div className="flex gap-2 md:col-span-full">
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="Output folder (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-accent/30 placeholder:text-slate-400 focus:ring"
          />
          <button
            type="button"
            onClick={() => {
              void pickOutputFolder();
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Browse
          </button>
        </div>

        <select
          value={speedMode}
          onChange={(e) => setSpeedMode(e.target.value as SpeedMode)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-accent/30 focus:ring"
        >
          {speedOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          value={maxSimultaneous}
          onChange={(e) => setMaxSimultaneous(e.target.value)}
          placeholder={
            maxSimultaneousAvailable
              ? `Max simultaneous (${maxSimultaneousAvailable} available)`
              : "Max simultaneous (optional)"
          }
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none ring-accent/30 placeholder:text-slate-400 focus:ring"
        />
      </div>

      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

      <div className="mt-4">
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Starting..." : "Start Download"}
        </button>
      </div>
    </form>
  );
}
