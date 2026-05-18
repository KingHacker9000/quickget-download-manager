import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { DownloadSnapshot } from "../types/agent";
import { formatBytes, formatDuration, formatSpeedMBps } from "../utils/format";
import { StatusPill } from "./StatusPill";
import { fileExists, openDownloadFile, openDownloadFolder } from "../api/fileActionsClient";
import { mapFriendlyError } from "../utils/errorMessages";

type Props = {
  open: boolean;
  download: DownloadSnapshot | null;
  onClose: () => void;
  onNotify: (message: string, tone?: "info" | "success" | "error") => void;
};

function displayTime(value?: string | null): string {
  if (!value) return "--";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function dirname(path?: string): string | null {
  if (!path) return null;
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (index <= 0) return null;
  return normalized.slice(0, index);
}

function formatDurationMs(durationMs?: number): string {
  if (typeof durationMs !== "number" || durationMs < 0) return "--";
  let seconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${remSeconds}s`;
  if (minutes > 0) return `${minutes}m ${remSeconds}s`;
  return `${remSeconds}s`;
}

export function DownloadHistoryDetailsModal({ open, download, onClose, onNotify }: Props) {
  const [exists, setExists] = useState<boolean>(false);
  const [checkingExists, setCheckingExists] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "open" | "folder">(null);

  const outputPath = download?.output_path;
  const downloadFolder = useMemo(() => dirname(outputPath), [outputPath]);
  const completedAt = download?.completed_at ?? download?.updated_at;
  const startedAt = (download?.metadata?.startedAt as string | undefined) ?? (download?.metadata?.started_at as string | undefined);
  const durationMs = download?.metadata?.durationMs as number | undefined;
  const averageSpeed = useMemo(() => {
    if (!download) return undefined;
    if (typeof download.metadata?.averageSpeedBytesPerSec === "number") return download.metadata.averageSpeedBytesPerSec as number;
    if (durationMs && durationMs > 0) {
      const total = download.total_bytes ?? download.downloaded_bytes;
      if (typeof total === "number" && total > 0) return (total * 1000) / durationMs;
    }
    return undefined;
  }, [download, durationMs]);
  const friendlyError = mapFriendlyError(download?.error) ?? download?.error;
  const source = typeof download?.metadata?.source === "string" && download.metadata.source.trim().length > 0 ? download.metadata.source : "Agent";

  useEffect(() => {
    if (!open || !outputPath) {
      setExists(false);
      return;
    }
    let active = true;
    setCheckingExists(true);
    void fileExists(outputPath)
      .then((result) => {
        if (!active) return;
        setExists(result);
      })
      .catch(() => {
        if (!active) return;
        setExists(false);
      })
      .finally(() => {
        if (!active) return;
        setCheckingExists(false);
      });
    return () => {
      active = false;
    };
  }, [open, outputPath]);

  if (!open || !download) return null;

  const canUseFile = Boolean(outputPath) && exists;

  const runAction = async (kind: "open" | "folder", action: () => Promise<void>) => {
    try {
      setBusyAction(kind);
      await action();
      onNotify("Action completed", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "File action failed";
      onNotify(message, "error");
    } finally {
      setBusyAction(null);
    }
  };

  const onCopyPath = async () => {
    if (!outputPath) {
      onNotify("No file path available", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(outputPath);
      onNotify("File path copied", "success");
    } catch {
      onNotify("Unable to copy file path", "error");
    }
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!outputPath) return;
    event.dataTransfer.setData("text/plain", outputPath);
    event.dataTransfer.effectAllowed = "copy";
    void navigator.clipboard.writeText(outputPath).catch(() => {});
    onNotify("File path attached to drag and copied as fallback", "info");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-100">{download.filename ?? download.id}</h3>
            <p className="truncate text-xs text-slate-400">{outputPath ?? "No output path available"}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill state={download.state} />
            <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" onClick={onClose} aria-label="Close download details">Close</button>
          </div>
        </header>

        <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
          <p className="text-xs text-slate-300"><span className="text-slate-500">URL:</span> <span className="break-all">{download.url ?? "--"}</span></p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Source:</span> {source}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">File size:</span> {formatBytes(download.total_bytes ?? download.downloaded_bytes)}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Download folder:</span> {downloadFolder ?? "--"}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Connections:</span> {download.connections ?? "--"} / Segments: {download.segments?.length ?? "--"}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Created:</span> {displayTime(download.created_at)}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Started:</span> {displayTime(startedAt)}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Completed:</span> {displayTime(completedAt)}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Time taken:</span> {typeof durationMs === "number" ? formatDurationMs(durationMs) : formatDuration(download.created_at, completedAt)}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Avg speed:</span> {formatSpeedMBps(averageSpeed)}</p>
          {friendlyError && <p className="text-xs text-rose-200"><span className="text-rose-300">Error:</span> {friendlyError}</p>}
        </div>

        <div className="border-t border-slate-700 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canUseFile || checkingExists || busyAction !== null}
              onClick={() => void runAction("open", async () => openDownloadFile(outputPath!))}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-100 hover:bg-slate-800 disabled:opacity-40"
              aria-label="Open downloaded file"
            >
              Open File
            </button>
            <button
              type="button"
              disabled={(!canUseFile && !downloadFolder) || checkingExists || busyAction !== null}
              onClick={() => void runAction("folder", async () => openDownloadFolder(outputPath ?? downloadFolder ?? ""))}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-100 hover:bg-slate-800 disabled:opacity-40"
              aria-label="Open download folder"
            >
              Open Folder
            </button>
            <button type="button" onClick={() => void onCopyPath()} className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/10" aria-label="Copy file path">
              Copy Path
            </button>
          </div>
          <div
            draggable={Boolean(outputPath)}
            onDragStart={onDragStart}
            className={`mt-3 rounded-xl border border-dashed px-3 py-3 text-xs ${outputPath ? "cursor-grab border-cyan-500/50 bg-cyan-500/10 text-cyan-100" : "border-slate-700 text-slate-500"}`}
          >
            {outputPath
              ? "Drag file out (fallback: path is copied and drag carries text path)."
              : "Drag unavailable: file path is missing."}
          </div>
          {checkingExists && <p className="mt-2 text-xs text-slate-400">Checking file availability...</p>}
          {!checkingExists && outputPath && !exists && (
            <p className="mt-2 text-xs text-amber-300">File not found at saved path. Folder/path actions may be limited.</p>
          )}
        </div>
      </div>
    </div>
  );
}
