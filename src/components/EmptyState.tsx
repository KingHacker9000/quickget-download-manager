type Props = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-8 text-center">
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}
