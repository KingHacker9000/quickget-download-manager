type Props = {
  open: boolean;
  busy: boolean;
  onPauseAndQuit: () => void;
  onKeepRunning: () => void;
  onCancel: () => void;
};

export function QuitConfirmModal({ open, busy, onPauseAndQuit, onKeepRunning, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-slate-100">Pause active downloads and quit?</h3>
        <p className="mt-2 text-sm text-slate-400">Active downloads are running. Choose how QuickGet Download Manager should proceed.</p>
        <div className="mt-5 flex gap-2">
          <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-60" disabled={busy} onClick={onPauseAndQuit}>Pause and Quit</button>
          <button className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-60" disabled={busy} onClick={onKeepRunning}>Keep Running</button>
          <button className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-60" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
