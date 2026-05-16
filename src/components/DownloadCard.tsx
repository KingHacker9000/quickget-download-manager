import { useMemo } from "react";
import type { DownloadSnapshot } from "../types/agent";
import { formatBytes, formatEta, formatPercent, formatSpeedMBps } from "../utils/format";
import { ProgressBar } from "./ProgressBar";
import { StatusPill } from "./StatusPill";

type Props = {
  download: DownloadSnapshot;
  busy?: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
};

export function DownloadCard({ download, busy = false, onPause, onResume, onCancel, onDelete }: Props) {
  const progress = useMemo(() => {
    if (typeof download.progress_percent === "number") return download.progress_percent;
    if (download.total_bytes && typeof download.downloaded_bytes === "number") {
      return (download.downloaded_bytes / download.total_bytes) * 100;
    }
    return 0;
  }, [download.progress_percent, download.total_bytes, download.downloaded_bytes]);

  const canPause = download.state === "downloading" || download.state === "starting";
  const canResume = download.state === "paused";
  const canCancel = ["queued", "starting", "downloading", "paused"].includes(download.state);
  const canDelete = ["completed", "failed", "cancelled"].includes(download.state);
  const isActivelyDownloading = download.state === "downloading" || download.state === "starting";
  const effectiveSpeed = isActivelyDownloading ? download.speed_bytes_per_sec : undefined;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{download.filename ?? download.url ?? download.id}</h3>
          <p className="mt-1 truncate text-xs text-slate-500">{download.output_path ?? "Auto output path"}</p>
        </div>
        <StatusPill state={download.state} />
      </div>

      <div className="mt-4">
        <ProgressBar value={progress} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
        <div>{formatBytes(download.downloaded_bytes)} / {formatBytes(download.total_bytes)}</div>
        <div>{formatPercent(progress)}</div>
        <div>{formatSpeedMBps(effectiveSpeed)}</div>
        <div>{formatEta(download.total_bytes, download.downloaded_bytes, effectiveSpeed)}</div>
      </div>

      {(download.warning || download.error) && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {download.error ?? download.warning}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canPause && (
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onPause(download.id)}
            disabled={busy}
          >
            Pause
          </button>
        )}
        {canResume && (
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onResume(download.id)}
            disabled={busy}
          >
            Resume
          </button>
        )}
        {canCancel && (
          <button
            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onCancel(download.id)}
            disabled={busy}
          >
            Cancel
          </button>
        )}
        {canDelete && (
          <button
            className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onDelete(download.id)}
            disabled={busy}
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
