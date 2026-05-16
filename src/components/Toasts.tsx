export type ToastTone = "info" | "success" | "error";

export type ToastItem = {
  id: number;
  message: string;
  tone?: ToastTone;
};

type Props = {
  items: ToastItem[];
  onDismiss: (id: number) => void;
};

function toneClass(tone: ToastTone | undefined): string {
  if (tone === "success") return "border-emerald-400/40 bg-emerald-500/20 text-emerald-100";
  if (tone === "error") return "border-rose-400/40 bg-rose-500/20 text-rose-100";
  return "border-slate-400/40 bg-slate-500/20 text-slate-100";
}

export function Toasts({ items, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-lg backdrop-blur ${toneClass(toast.tone)}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded px-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
