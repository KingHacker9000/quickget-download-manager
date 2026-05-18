type NavItem = "Downloads" | "History" | "Profiler" | "Settings";

type Props = {
  items: NavItem[];
  active: NavItem;
  onSelect: (item: NavItem) => void;
};

export function Sidebar({ items, active, onSelect }: Props) {
  return (
    <aside className="flex w-52 shrink-0 flex-col rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 shadow-xl backdrop-blur-xl">
      <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">QuickGet</p>
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = item === active;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onSelect(item)}
              className={[
                "flex w-full items-center justify-start rounded-xl px-3 py-2 text-sm transition",
                isActive
                  ? "bg-gradient-to-r from-blue-500/30 to-cyan-400/20 text-slate-100"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
              ].join(" ")}
            >
              {item}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export type { NavItem };
