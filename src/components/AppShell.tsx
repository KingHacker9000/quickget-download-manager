import { Sidebar, type NavItem } from "./Sidebar";
import type { ReactNode } from "react";

type Props = {
  activeSection: NavItem;
  onSectionChange: (item: NavItem) => void;
  children: ReactNode;
};

const navItems: NavItem[] = ["Downloads", "History", "Profiler", "Settings", "Diagnostics", "About"];

export function AppShell({ activeSection, onSectionChange, children }: Props) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 text-slate-100">
      <div className="mx-auto flex max-w-7xl gap-4">
        <Sidebar items={navItems} active={activeSection} onSelect={onSectionChange} />
        <section className="min-h-[calc(100vh-2rem)] flex-1 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 shadow-2xl backdrop-blur-xl">
          {children}
        </section>
      </div>
    </main>
  );
}
