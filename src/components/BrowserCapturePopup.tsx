import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import type { CaptureSnapshot, DownloadSnapshot } from "../types/agent";
import { formatBytes, formatEtaLabel, formatPercent, formatSpeedMBps } from "../utils/format";
import { openDownloadFile, openDownloadFolder } from "../api/fileActionsClient";
import { CaptureFileInfo } from "./CaptureFileInfo";
import { DuplicateFilePrompt } from "./DuplicateFilePrompt";
import { ProgressBar } from "./ProgressBar";
import { StatusPill } from "./StatusPill";

type Props = {
  capture: CaptureSnapshot | null;
  activeDownload?: DownloadSnapshot | null;
  defaultOutputDir: string | null;
  defaultSpeedMode: "auto" | "manual";
  mode?: "overlay" | "window";
  busy?: boolean;
  onStart: (request: { output_dir?: string; filename?: string; speed_mode?: "auto" | "manual"; duplicate_action?: "overwrite" | "new_name" }) => Promise<void>;
  onReject: () => Promise<void>;
  onOpenFullQdm: () => Promise<void>;
  onClosePopup?: () => Promise<void>;
  onShowExisting: () => Promise<void>;
  onPauseDownload?: (id: string) => Promise<void>;
  onResumeDownload?: (id: string) => Promise<void>;
  onCancelDownload?: (id: string) => Promise<void>;
};

function suggestUniqueFilename(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (1)`;
  return `${name.slice(0, dot)} (1)${name.slice(dot)}`;
}

export function BrowserCapturePopup({
  capture,
  activeDownload = null,
  defaultOutputDir,
  defaultSpeedMode,
  mode = "overlay",
  busy,
  onStart,
  onReject,
  onOpenFullQdm,
  onClosePopup,
  onShowExisting,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
}: Props) {
  const [outputDir, setOutputDir] = useState(capture?.output_dir ?? defaultOutputDir ?? "");
  const [filename, setFilename] = useState(capture?.suggested_filename ?? "download.bin");
  const [speedMode, setSpeedMode] = useState<"auto" | "manual">(capture?.speed_mode ?? defaultSpeedMode);
  const isDuplicate = useMemo(
    () => (capture ? capture.state === "duplicate" || Boolean(capture.duplicate?.existing_path) : false),
    [capture]
  );
  const progressPercent = useMemo(() => {
    if (!activeDownload) return undefined;
    if (activeDownload.state === "completed") return 100;
    if (typeof activeDownload.progress_percent === "number") return activeDownload.progress_percent;
    if (activeDownload.total_bytes && typeof activeDownload.downloaded_bytes === "number") {
      return (activeDownload.downloaded_bytes / activeDownload.total_bytes) * 100;
    }
    return undefined;
  }, [activeDownload]);
  const isDownloading = activeDownload?.state === "starting" || activeDownload?.state === "downloading";
  const isCompleted = activeDownload?.state === "completed";
  const isTerminal = activeDownload?.state === "completed" || activeDownload?.state === "failed" || activeDownload?.state === "cancelled";
  const etaLabel = activeDownload
    ? activeDownload.state === "completed"
      ? "Completed"
      : activeDownload.state === "failed"
        ? "Failed"
        : activeDownload.state === "cancelled"
          ? "Cancelled"
          : formatEtaLabel(activeDownload.total_bytes, activeDownload.downloaded_bytes, isDownloading ? activeDownload.speed_bytes_per_sec : undefined)
    : "";

  useEffect(() => {
    setOutputDir(capture?.output_dir ?? defaultOutputDir ?? "");
    setFilename(capture?.suggested_filename ?? "download.bin");
    setSpeedMode(capture?.speed_mode ?? defaultSpeedMode);
  }, [capture?.id, capture?.output_dir, capture?.suggested_filename, capture?.speed_mode, defaultOutputDir, defaultSpeedMode]);

  const browseFolder = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Select save folder" });
    if (typeof selected === "string") setOutputDir(selected);
  };

  const containerClass =
    mode === "window"
      ? "w-full overflow-x-hidden overflow-y-auto bg-slate-900 p-3"
      : "fixed bottom-4 right-4 z-50 w-[28rem] max-w-[calc(100vw-1rem)] rounded-xl border border-slate-600 bg-slate-900/95 p-3 shadow-2xl backdrop-blur";

  return (
    <div className={containerClass}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100">{capture ? "Browser Download Capture" : "QuickGet Popup"}</p>
        {capture ? (
          <button type="button" disabled={busy} onClick={() => void onReject()} className="text-xs text-slate-400 hover:text-slate-200">Use Chrome Instead</button>
        ) : null}
      </div>
      {capture ? (
        <>
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
        </>
      ) : null}
      {activeDownload ? (
        <div className={`rounded-lg border border-slate-700 bg-slate-950/50 p-3 ${capture ? "mt-3" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-100">{activeDownload.filename ?? activeDownload.url ?? activeDownload.id}</p>
            <StatusPill state={activeDownload.state} />
          </div>
          <p className="truncate text-xs text-slate-400">{activeDownload.output_path ?? "Automatic location"}</p>
          <div className="mt-2">
            <ProgressBar
              value={progressPercent ?? 0}
              totalBytes={activeDownload.total_bytes}
              segments={activeDownload.segments ?? []}
              indeterminate={!activeDownload.total_bytes && ["queued", "starting", "downloading"].includes(activeDownload.state)}
              label={`Download progress for ${activeDownload.filename ?? activeDownload.id}`}
            />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-300 sm:grid-cols-2">
            <p>Progress: {formatPercent(progressPercent)}</p>
            <p>Speed: {formatSpeedMBps(isDownloading ? activeDownload.speed_bytes_per_sec : undefined)}</p>
            <p>Downloaded: {formatBytes(activeDownload.downloaded_bytes)}</p>
            <p>Total: {formatBytes(activeDownload.total_bytes)}</p>
          </div>
          <p className="mt-1 text-xs text-slate-400">ETA: {etaLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeDownload.state === "paused" ? (
              <button
                type="button"
                disabled={!onResumeDownload}
                onClick={() => onResumeDownload ? void onResumeDownload(activeDownload.id) : undefined}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
              >
                Resume
              </button>
            ) : !isTerminal ? (
              <button
                type="button"
                disabled={!onPauseDownload || (activeDownload.state !== "starting" && activeDownload.state !== "downloading")}
                onClick={() => onPauseDownload ? void onPauseDownload(activeDownload.id) : undefined}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
              >
                Pause
              </button>
            ) : null}
            {!isTerminal ? (
              <button
                type="button"
                disabled={!onCancelDownload}
                onClick={() => onCancelDownload ? void onCancelDownload(activeDownload.id) : undefined}
                className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200"
              >
                Cancel
              </button>
            ) : null}
            {isCompleted ? (
              <>
                <button
                  type="button"
                  disabled={!activeDownload.output_path}
                  onClick={() => activeDownload.output_path ? void openDownloadFile(activeDownload.output_path) : undefined}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
                >
                  Open File
                </button>
                <button
                  type="button"
                  disabled={!activeDownload.output_path}
                  onClick={() => activeDownload.output_path ? void openDownloadFolder(activeDownload.output_path) : undefined}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
                >
                  Open Folder
                </button>
                <button
                  type="button"
                  disabled={!activeDownload.output_path}
                  onClick={() => activeDownload.output_path ? void navigator.clipboard.writeText(activeDownload.output_path) : undefined}
                  className="rounded-md border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-200"
                >
                  Copy Path
                </button>
              </>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void onOpenFullQdm()} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200">
              Open Full QDM
            </button>
            {onClosePopup ? (
              <button type="button" onClick={() => void onClosePopup()} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                Close Popup
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
