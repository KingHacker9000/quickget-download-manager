import { open } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import type { CaptureSnapshot } from "../types/agent";
import { CaptureFileInfo } from "./CaptureFileInfo";
import { DuplicateFilePrompt } from "./DuplicateFilePrompt";

type Props = {
  capture: CaptureSnapshot;
  defaultOutputDir: string | null;
  defaultSpeedMode: "auto" | "manual";
  busy?: boolean;
  onStart: (request: { output_dir?: string; filename?: string; speed_mode?: "auto" | "manual"; duplicate_action?: "overwrite" | "new_name" }) => Promise<void>;
  onReject: () => Promise<void>;
  onOpenFullQdm: () => Promise<void>;
  onShowExisting: () => Promise<void>;
};

function suggestUniqueFilename(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (1)`;
  return `${name.slice(0, dot)} (1)${name.slice(dot)}`;
}

export function BrowserCapturePopup({ capture, defaultOutputDir, defaultSpeedMode, busy, onStart, onReject, onOpenFullQdm, onShowExisting }: Props) {
  const [outputDir, setOutputDir] = useState(capture.output_dir ?? defaultOutputDir ?? "");
  const [filename, setFilename] = useState(capture.suggested_filename ?? "download.bin");
  const [speedMode, setSpeedMode] = useState<"auto" | "manual">(capture.speed_mode ?? defaultSpeedMode);
  const isDuplicate = useMemo(() => capture.state === "duplicate" || Boolean(capture.duplicate?.existing_path), [capture]);

  const browseFolder = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Select save folder" });
    if (typeof selected === "string") setOutputDir(selected);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[28rem] max-w-[calc(100vw-1rem)] rounded-xl border border-slate-600 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100">Browser Download Capture</p>
        <button type="button" disabled={busy} onClick={() => void onReject()} className="text-xs text-slate-400 hover:text-slate-200">Use Chrome Instead</button>
      </div>
      <CaptureFileInfo capture={capture} />
      <div className="mt-2 space-y-2">
        <label className="block text-xs text-slate-300">
          Save Location
          <div className="mt-1 flex gap-2">
            <input value={outputDir} onChange={(e) => setOutputDir(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" />
            <button type="button" onClick={() => void browseFolder()} className="rounded-md border border-slate-700 px-2 text-xs text-slate-200">Browse</button>
          </div>
        </label>
        <label className="block text-xs text-slate-300">
          Filename
          <input value={filename} onChange={(e) => setFilename(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" />
        </label>
        <label className="block text-xs text-slate-300">
          Speed Mode
          <select value={speedMode} onChange={(e) => setSpeedMode(e.target.value === "manual" ? "manual" : "auto")} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100">
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </label>
      </div>
      {isDuplicate ? (
        <div className="mt-2">
          <DuplicateFilePrompt
            capture={capture}
            busy={Boolean(busy)}
            onOverwrite={() => void onStart({ output_dir: outputDir || undefined, filename, speed_mode: speedMode, duplicate_action: "overwrite" })}
            onNewName={() => void onStart({ output_dir: outputDir || undefined, filename: suggestUniqueFilename(filename), speed_mode: speedMode, duplicate_action: "new_name" })}
            onShowExisting={() => void onShowExisting()}
          />
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void onStart({ output_dir: outputDir || undefined, filename, speed_mode: speedMode })} className="rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100">
          Start Download
        </button>
        <button type="button" disabled={busy} onClick={() => void onOpenFullQdm()} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200">
          Open Full QDM
        </button>
      </div>
    </div>
  );
}
