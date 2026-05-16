import type { DownloadSnapshot } from "../types/agent";
import { DownloadCard } from "./DownloadCard";
import { EmptyState } from "./EmptyState";

type Props = {
  title: string;
  downloads: DownloadSnapshot[];
  busyIds: Set<string>;
  emptyTitle: string;
  emptyDescription: string;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
};

export function DownloadList({
  title,
  downloads,
  busyIds,
  emptyTitle,
  emptyDescription,
  onPause,
  onResume,
  onCancel,
  onDelete,
}: Props) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h2>
      {downloads.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="space-y-3">
          {downloads.map((download) => (
            <DownloadCard
              key={download.id}
              download={download}
              busy={busyIds.has(download.id)}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
