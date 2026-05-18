import type { CaptureSnapshot } from "../types/agent";

type Props = {
  capture: CaptureSnapshot;
  busy: boolean;
  onOverwrite: () => void;
  onNewName: () => void;
  onShowExisting: () => void;
};

export function DuplicateFilePrompt({ capture, busy, onOverwrite, onNewName, onShowExisting }: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
      <p className="text-xs text-amber-100">
        Duplicate detected{capture.duplicate?.existing_path ? `: ${capture.duplicate.existing_path}` : "."}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" disabled={busy} onClick={onOverwrite} className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-2 py-2 text-xs text-amber-100">
          Redownload / Overwrite
        </button>
        <button type="button" disabled={busy} onClick={onNewName} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-2 text-xs text-slate-100">
          Download with New Name
        </button>
        <button type="button" disabled={busy} onClick={onShowExisting} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-2 text-xs text-slate-100">
          Show Downloaded File
        </button>
      </div>
    </div>
  );
}
