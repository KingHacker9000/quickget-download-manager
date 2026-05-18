import { useEffect, useMemo, useState } from "react";
import type { DownloadSnapshot } from "../types/agent";
import { formatBytes, formatDuration, formatEta, formatEtaLabel, formatPercent, formatSpeedMBps } from "../utils/format";
import { ProgressBar } from "./ProgressBar";
import { StatusPill } from "./StatusPill";

type Props = {
  download: DownloadSnapshot;
  busy?: boolean;
  isCompleted?: boolean;
  onSelect?: (download: DownloadSnapshot) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
};

export function DownloadRow({
  download,
  busy = false,
  isCompleted = false,
  onSelect,
  onPause,
  onResume,
  onCancel,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const debugProgressEnabled =
    import.meta.env.DEV &&
    String((import.meta.env as Record<string, unknown>).QDM_DEBUG_PROGRESS ?? import.meta.env.VITE_QDM_DEBUG_PROGRESS ?? "") === "1";

  const progress = useMemo(() => {
    if (download.state === "completed") return 100;
    if (typeof download.progress_percent === "number") return download.progress_percent;
    if (download.total_bytes && typeof download.downloaded_bytes === "number") {
      return (download.downloaded_bytes / download.total_bytes) * 100;
    }
    return 0;
  }, [download.downloaded_bytes, download.progress_percent, download.total_bytes, download.state]);

  const canPause = download.state === "downloading" || download.state === "starting";
  const canResume = download.state === "paused";
  const canCancel = ["queued", "starting", "downloading", "paused"].includes(download.state);
  const isActivelyDownloading = download.state === "downloading" || download.state === "starting";
  const indeterminate = !download.total_bytes && ["queued", "starting", "downloading"].includes(download.state);
  const segments = download.segments ?? [];
  const activeSegments = segments.filter((segment) => segment.status === "running").length;
  const completedSegments = segments.filter((segment) => segment.status === "completed").length;
  const failedSegments = segments.filter((segment) => segment.status === "failed").length;
  const effectiveSpeed = isActivelyDownloading ? download.speed_bytes_per_sec : undefined;
  const etaText = formatEta(download.total_bytes, download.downloaded_bytes, effectiveSpeed);
  const etaLabel = formatEtaLabel(download.total_bytes, download.downloaded_bytes, effectiveSpeed);
  const completedAt = download.completed_at ?? download.updated_at;
  const elapsedEnd =
    download.state === "completed" || download.state === "paused"
      ? completedAt
      : undefined;
  const elapsed = formatDuration(download.created_at, elapsedEnd);

  useEffect(() => {
    if (!debugProgressEnabled) return;
    console.debug("[QDM] row-rerender", {
      id: download.id,
      downloaded: download.downloaded_bytes ?? 0,
      total: download.total_bytes ?? 0,
      segments: segments.length,
      ts: new Date().toISOString(),
    });
  }, [debugProgressEnabled, download.id, download.downloaded_bytes, download.total_bytes, segments.length]);

  return (
    <article
      className={`rounded-xl border border-slate-700/70 bg-slate-900/60 px-3 py-2 ${onSelect ? "cursor-pointer transition hover:border-cyan-500/40 hover:bg-slate-800/60" : ""}`}
      onClick={onSelect ? () => onSelect(download) : undefined}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          className="mt-1 rounded-md px-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          {expanded ? "v" : ">"}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-slate-100">{download.filename ?? download.url ?? download.id}</p>
            <StatusPill state={download.state} />
          </div>

          {!isCompleted && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <ProgressBar
                    value={progress}
                    totalBytes={download.total_bytes}
                    segments={segments}
                    indeterminate={indeterminate}
                  />
                </div>
                <span className="min-w-36 text-right text-xs text-slate-300">{etaLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400 md:grid-cols-6">
                <span>{formatPercent(progress)}</span>
                <span>{formatSpeedMBps(effectiveSpeed)}</span>
                <span>{etaText}</span>
                <span>Elapsed: {elapsed}</span>
                <span>{formatBytes(download.downloaded_bytes)}</span>
                <span>{formatBytes(download.total_bytes)}</span>
              </div>
              {segments.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500 md:grid-cols-4">
                  <span>Segments: {segments.length}</span>
                  <span>Active: {activeSegments}</span>
                  <span>Completed: {completedSegments}</span>
                  <span>Failed: {failedSegments}</span>
                </div>
              )}
            </div>
          )}

          {isCompleted && (
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-400 md:grid-cols-2">
              <p>{formatBytes(download.total_bytes ?? download.downloaded_bytes)}</p>
              <p>Time taken: {formatDuration(download.created_at, completedAt)}</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          {canPause && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPause(download.id);
              }}
              disabled={busy}
              className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Pause
            </button>
          )}
          {canResume && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onResume(download.id);
              }}
              disabled={busy}
              className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Resume
            </button>
          )}
          {canCancel && !isCompleted && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCancel(download.id);
              }}
              disabled={busy}
              className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"
            >
              Cancel
            </button>
          )}
          {(isCompleted || download.state === "failed" || download.state === "cancelled") && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(download.id);
              }}
              disabled={busy}
              className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid gap-1 border-t border-slate-700/70 pt-2 text-xs text-slate-400">
          <p><span className="text-slate-500">ID:</span> {download.id}</p>
          {download.output_path && <p><span className="text-slate-500">Output:</span> {download.output_path}</p>}
          {download.url && <p className="break-all"><span className="text-slate-500">URL:</span> {download.url}</p>}
          {download.warning && <p className="text-amber-200">Warning: {download.warning}</p>}
          {download.error && <p className="text-rose-200">Error: {download.error}</p>}
          <p>
            <span className="text-slate-500">State:</span> {download.state}
            {download.updated_at ? ` | Updated: ${download.updated_at}` : ""}
          </p>
          {typeof download.connections === "number" && <p><span className="text-slate-500">Connections:</span> {download.connections}</p>}
          {typeof download.active_jobs === "number" && <p><span className="text-slate-500">Active workers:</span> {download.active_jobs}</p>}
          {segments.length > 0 && (
            <div className="mt-1 overflow-x-auto rounded-lg border border-slate-700/60">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-800/80 text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Segment</th>
                    <th className="px-2 py-1 text-left">Range</th>
                    <th className="px-2 py-1 text-left">Progress</th>
                    <th className="px-2 py-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((segment) => {
                    const size = segment.end_byte - segment.start_byte + 1;
                    const segPct = size > 0 ? Math.max(0, Math.min(100, (segment.downloaded_bytes_within_segment / size) * 100)) : 0;
                    return (
                      <tr key={`${segment.index}-${segment.start_byte}-${segment.end_byte}`} className="border-t border-slate-700/40">
                        <td className="px-2 py-1 text-slate-300">#{segment.index}</td>
                        <td className="px-2 py-1 text-slate-400">{segment.start_byte}-{segment.end_byte}</td>
                        <td className="px-2 py-1 text-slate-300">{segPct.toFixed(1)}%</td>
                        <td className="px-2 py-1 text-slate-400">{segment.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
