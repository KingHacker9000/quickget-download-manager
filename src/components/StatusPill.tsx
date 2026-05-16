import type { DownloadState } from "../types/agent";

type Props = {
  state: DownloadState;
};

const labelByState: Record<DownloadState, string> = {
  queued: "Queued",
  starting: "Starting",
  downloading: "Downloading",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

const classByState: Record<DownloadState, string> = {
  queued: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  starting: "bg-blue-500/20 text-blue-200 border-blue-400/40",
  downloading: "bg-cyan-500/20 text-cyan-200 border-cyan-400/40",
  paused: "bg-amber-500/20 text-amber-200 border-amber-400/40",
  completed: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40",
  cancelled: "bg-zinc-500/20 text-zinc-200 border-zinc-400/40",
  failed: "bg-rose-500/20 text-rose-200 border-rose-400/40",
};

export function StatusPill({ state }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classByState[state]}`}>
      {labelByState[state]}
    </span>
  );
}
