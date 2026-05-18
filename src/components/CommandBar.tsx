import { useState, type KeyboardEvent } from "react";

type Props = {
  onOpenAdd: (url?: string) => void;
};

export function CommandBar({ onOpenAdd }: Props) {
  const [url, setUrl] = useState("");

  const submit = () => {
    onOpenAdd(url.trim() || undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="mb-4 rounded-2xl border border-slate-700/70 bg-slate-800/60 p-2 shadow-lg backdrop-blur-xl">
      <div className="flex gap-2">
        <label htmlFor="command-url-input" className="sr-only">Download URL</label>
        <input
          id="command-url-input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Paste a download URL..."
          className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500/40 placeholder:text-slate-500 focus:ring"
          aria-label="Download URL"
        />
        <button
          type="button"
          onClick={submit}
          className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"
          aria-label="Add download"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
