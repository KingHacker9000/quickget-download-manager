import type { CaptureSnapshot } from "../types/agent";

type Props = {
  capture: CaptureSnapshot;
};

export function CaptureFileInfo({ capture }: Props) {
  const sourceUrl = capture.url ?? "Unknown URL";
  const domain = capture.source?.domain ?? (() => {
    try {
      return sourceUrl.startsWith("http") ? new URL(sourceUrl).hostname : "Unknown domain";
    } catch {
      return "Unknown domain";
    }
  })();
  const pageUrl = capture.source?.page_url ?? capture.source?.referrer ?? "Unknown page";

  return (
    <div className="space-y-1 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-300">
      <p className="truncate text-sm font-semibold text-slate-100">{capture.suggested_filename ?? "Unnamed file"}</p>
      <p className="truncate"><span className="text-slate-500">Domain:</span> {domain}</p>
      <p className="truncate"><span className="text-slate-500">URL:</span> {sourceUrl}</p>
      <p className="truncate"><span className="text-slate-500">Page:</span> {pageUrl}</p>
    </div>
  );
}
