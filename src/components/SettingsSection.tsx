import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SettingsSection({ title, description, actions, children }: Props) {
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
