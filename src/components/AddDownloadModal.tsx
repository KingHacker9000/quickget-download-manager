import { useEffect, useMemo, useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { CreateDownloadRequest } from "../types/agent";

type PresetMode = "Auto" | "Balanced" | "Aggressive" | "Gentle";

const presetOptions: PresetMode[] = ["Auto", "Balanced", "Aggressive", "Gentle"];

type Props = {
  open: boolean;
  canSubmit: boolean;
  initialUrl?: string;
  onClose: () => void;
  onSubmit: (request: CreateDownloadRequest) => Promise<void>;
};

export function AddDownloadModal({ open: isOpen, canSubmit, initialUrl, onClose, onSubmit }: Props) {
  const [url, setUrl] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [filename, setFilename] = useState("");
  const [preset, setPreset] = useState<PresetMode>("Auto");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxSimultaneous, setMaxSimultaneous] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setUrl(initialUrl ?? "");
    setError(null);
  }, [isOpen, initialUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const parsedMax = useMemo(() => {
    if (!maxSimultaneous.trim()) return undefined;
    const parsed = Number.parseInt(maxSimultaneous, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }, [maxSimultaneous]);

  if (!isOpen) return null;

  const pickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select save folder" });
      if (typeof selected === "string") setOutputDir(selected);
    } catch {
      setError("Folder picker unavailable. Enter a save folder manually.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) {
      setError("Please enter a valid URL.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        url: url.trim(),
        output_dir: outputDir.trim() || undefined,
        filename: filename.trim() || undefined,
        metadata:
          preset !== "Auto" || parsedMax
            ? {
                ...(preset !== "Auto" ? { speed_mode: preset.toLowerCase() } : {}),
                ...(parsedMax ? { max_simultaneous_downloads: parsedMax } : {}),
                // TODO: Add future QuickGet advanced flags once represented in shared types.
              }
            : undefined,
      });
      onClose();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to create download";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-slate-700/70 bg-slate-900/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Add Download</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            Esc
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/file.zip"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500/40 placeholder:text-slate-500 focus:ring"
          />

          <div className="flex gap-2">
            <input
              value={outputDir}
              onChange={(event) => setOutputDir(event.target.value)}
              placeholder="Save folder"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500/40 placeholder:text-slate-500 focus:ring"
            />
            <button type="button" onClick={() => void pickFolder()} className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              Browse
            </button>
          </div>

          <input
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            placeholder="Filename (optional)"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500/40 placeholder:text-slate-500 focus:ring"
          />

          <select
            value={preset}
            onChange={(event) => setPreset(event.target.value as PresetMode)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500/40 focus:ring"
          >
            {presetOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <div className="rounded-xl border border-slate-700/80 bg-slate-950/40">
            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-300"
            >
              Advanced options
              <span>{showAdvanced ? "-" : "+"}</span>
            </button>
            {showAdvanced && (
              <div className="border-t border-slate-700/70 px-3 py-3">
                <input
                  value={maxSimultaneous}
                  onChange={(event) => setMaxSimultaneous(event.target.value)}
                  type="number"
                  min={1}
                  placeholder="Max simultaneous / connection count"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500/40 placeholder:text-slate-500 focus:ring"
                />
              </div>
            )}
          </div>

          {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Starting..." : "Start Download"}
          </button>
        </div>
      </form>
    </div>
  );
}
