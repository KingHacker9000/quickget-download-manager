import type { SegmentProgress } from "../types/agent";

type Props = {
  value: number;
  totalBytes?: number;
  segments?: SegmentProgress[];
  indeterminate?: boolean;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function segmentClass(status: string): string {
  if (status === "completed") return "bg-cyan-300/90";
  if (status === "running") return "bg-cyan-400/70";
  if (status === "failed" || status === "cancelled") return "bg-rose-400/75";
  if (status === "paused") return "bg-amber-300/60";
  return "bg-slate-600/30";
}

export function ProgressBar({ value, totalBytes, segments, indeterminate = false }: Props) {
  const clamped = clampPercent(value);
  const hasSegmentModel = !!totalBytes && totalBytes > 0 && !!segments && segments.length > 0;
  const debugProgressEnabled =
    import.meta.env.DEV &&
    String((import.meta.env as Record<string, unknown>).QDM_DEBUG_PROGRESS ?? import.meta.env.VITE_QDM_DEBUG_PROGRESS ?? "") === "1";
  if (debugProgressEnabled && hasSegmentModel && segments && segments.length > 0) {
    const first = segments[0];
    const segmentSize = first.end_byte - first.start_byte + 1;
    const left = totalBytes ? (first.start_byte / totalBytes) * 100 : 0;
    const width = totalBytes ? (segmentSize / totalBytes) * 100 : 0;
    const fill = segmentSize > 0 ? clampPercent((first.downloaded_bytes_within_segment / segmentSize) * 100) : 0;
    console.debug("[QDM] progressbar segments", {
      totalBytes,
      segmentCount: segments.length,
      firstLeftPct: left,
      firstWidthPct: width,
      firstFillPct: fill,
      ts: Date.now(),
    });
  }

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full border border-slate-700/60 bg-slate-800/80">
      {indeterminate && !hasSegmentModel ? (
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 motion-safe:animate-[qdm-indeterminate_1s_ease-in-out_infinite]" />
      ) : hasSegmentModel ? (
        <div className="relative h-full w-full">
          {segments!.map((segment) => {
            const segmentSize = segment.end_byte - segment.start_byte + 1;
            if (segmentSize <= 0 || !totalBytes) return null;
            const left = (segment.start_byte / totalBytes) * 100;
            const width = (segmentSize / totalBytes) * 100;
            const segmentPct = clampPercent((segment.downloaded_bytes_within_segment / segmentSize) * 100);
            return (
              <div
                key={`${segment.index}-${segment.start_byte}-${segment.end_byte}`}
                className="absolute inset-y-0 z-10 border-r border-slate-900/70"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`Segment ${segment.index} | ${segment.status} | ${segmentPct.toFixed(1)}%`}
              >
                <div className="absolute inset-0 h-full w-full bg-slate-700/40" />
                <div
                  className={`absolute left-0 top-0 ${segmentClass(segment.status)} h-full transition-[width] duration-100 ease-out ${segment.status === "running" ? "motion-safe:animate-pulse" : ""}`}
                  style={{ width: `${segmentPct}%` }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-[width] duration-100 ease-out"
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
