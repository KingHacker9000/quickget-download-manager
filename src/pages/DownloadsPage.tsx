import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { AddDownloadModal } from "../components/AddDownloadModal";
import { CommandBar } from "../components/CommandBar";
import { DownloadRow } from "../components/DownloadRow";
import { DownloadHistoryDetailsModal } from "../components/DownloadHistoryDetailsModal";
import type { NavItem } from "../components/Sidebar";
import { SettingsPage } from "./SettingsPage";
import { ProfilerPage } from "./ProfilerPage";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { AboutPage } from "./AboutPage";
import type { RunProfilerRequest } from "../api/agentClient";
import type {
  AgentConnectionState,
  AgentStatus,
  CreateDownloadRequest,
  DownloadSnapshot,
  QdmRuntimeBuildInfo,
} from "../types/agent";
import type { AppSettings } from "../types/settings";
import type { DiagnosticEntry } from "../utils/diagnostics";
import { mapFriendlyError } from "../utils/errorMessages";

type Props = {
  agentState: AgentConnectionState;
  agentStatus: AgentStatus | null;
  errorMessage: string | null;
  activeDownloads: DownloadSnapshot[];
  recentCompletedDownloads: DownloadSnapshot[];
  historyDownloads: DownloadSnapshot[];
  busyIds: Set<string>;
  onCreateDownload: (request: CreateDownloadRequest) => Promise<void>;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  settings: AppSettings | null;
  settingsBusy: boolean;
  onSettingsChange: (next: AppSettings) => void;
  onRunProfiler: (request?: RunProfilerRequest) => Promise<void>;
  onCancelProfiler: () => Promise<void>;
  onRefreshProfilerStatus: () => Promise<void>;
  onRestoreRecommended: () => void;
  forceShowDownloadsToken: number;
  onNotify: (message: string, tone?: "info" | "success" | "error") => void;
  appVersion: string;
  runtimeBuildInfo: QdmRuntimeBuildInfo | null;
  frontendBuildCommit: string;
  frontendBuildTime: string;
  diagnostics: DiagnosticEntry[];
  onCopyDiagnostics: () => Promise<void>;
};

function connectionText(state: AgentConnectionState, status: AgentStatus | null): string {
  if (state === "connected") {
    const version = status?.version ? ` v${status.version}` : "";
    return `Connected: ${status?.base_url ?? "quickget-agent"}${version}`;
  }
  if (state === "starting") return "Connecting...";
  if (state === "failed") return "Connection failed";
  return "Disconnected";
}

function connectionBadgeClass(state: AgentConnectionState): string {
  if (state === "connected") return "border-emerald-400/40 bg-emerald-500/20 text-emerald-200";
  if (state === "starting") return "border-blue-400/40 bg-blue-500/20 text-blue-200";
  if (state === "disconnected") return "border-amber-400/40 bg-amber-500/20 text-amber-200";
  return "border-rose-400/40 bg-rose-500/20 text-rose-200";
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-4">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export function DownloadsPage({
  agentState,
  agentStatus,
  errorMessage,
  activeDownloads,
  recentCompletedDownloads,
  historyDownloads,
  busyIds,
  onCreateDownload,
  onPause,
  onResume,
  onCancel,
  onDelete,
  settings,
  settingsBusy,
  onSettingsChange,
  onRunProfiler,
  onCancelProfiler,
  onRefreshProfilerStatus,
  onRestoreRecommended,
  forceShowDownloadsToken,
  onNotify,
  appVersion,
  runtimeBuildInfo,
  frontendBuildCommit,
  frontendBuildTime,
  diagnostics,
  onCopyDiagnostics,
}: Props) {
  const [activeSection, setActiveSection] = useState<NavItem>("Downloads");
  const [modalOpen, setModalOpen] = useState(false);
  const [prefillUrl, setPrefillUrl] = useState<string | undefined>(undefined);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [historyDetails, setHistoryDetails] = useState<DownloadSnapshot | null>(null);

  const friendlyError = mapFriendlyError(errorMessage);

  const canShowDownloads = useMemo(() => activeSection === "Downloads", [activeSection]);

  const openAddModal = (url?: string) => {
    setPrefillUrl(url);
    setModalOpen(true);
  };

  useEffect(() => {
    setActiveSection("Downloads");
  }, [forceShowDownloadsToken]);

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
        return;
      }

      const isPasteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
      if (!isPasteShortcut) return;

      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        if (!/^https?:\/\//i.test(trimmed)) return;
        openAddModal(trimmed);
      } catch {
        // Clipboard access may be unavailable in some environments.
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <AppShell activeSection={activeSection} onSectionChange={setActiveSection}>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Downloads</h1>
          <p className="text-xs text-slate-400">Modern QuickGet desktop workflow</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${connectionBadgeClass(agentState)}`}>
            {agentState}
          </span>
          <span className="text-xs text-slate-400">{connectionText(agentState, agentStatus)}</span>
        </div>
      </header>

      {friendlyError && <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{friendlyError}</div>}

      {canShowDownloads ? (
        <>
          <CommandBar onOpenAdd={openAddModal} />

          <section className="space-y-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Active</h2>
              <span className="text-xs text-slate-500">{activeDownloads.length}</span>
            </div>
            {activeDownloads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-4">
                <p className="text-sm font-semibold text-slate-100">Paste a download URL to get started</p>
                <p className="mt-1 text-xs text-slate-400">Downloads continue in the tray after you close the main window.</p>
                <p className="mt-1 text-xs text-slate-500">QDM v0.1.0 is Windows-first. macOS/Linux support remains experimental.</p>
              </div>
            ) : (
              activeDownloads.map((download) => (
                <DownloadRow
                  key={download.id}
                  download={download}
                  busy={busyIds.has(download.id)}
                  onPause={onPause}
                  onResume={onResume}
                  onCancel={onCancel}
                  onDelete={onDelete}
                />
              ))
            )}
          </section>

          <section className="mt-5">
            <button
              type="button"
              onClick={() => setCompletedOpen((current) => !current)}
              className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/40 px-3 py-2 text-left"
              aria-label={completedOpen ? "Hide completed downloads" : "Show completed downloads"}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Completed</span>
              <span className="text-xs text-slate-500">{recentCompletedDownloads.length} {completedOpen ? "-" : "+"}</span>
            </button>
            {completedOpen &&
              (recentCompletedDownloads.length === 0 ? (
                <EmptyState title="No completed downloads" hint="Finished files appear here." />
              ) : (
                <div className="space-y-2">
                  {recentCompletedDownloads.map((download) => (
                    <DownloadRow
                      key={download.id}
                      download={download}
                      isCompleted
                      busy={busyIds.has(download.id)}
                      onPause={onPause}
                      onResume={onResume}
                      onCancel={onCancel}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              ))}
          </section>

          <AddDownloadModal
            open={modalOpen}
            canSubmit={agentState === "connected"}
            initialUrl={prefillUrl}
            settings={settings}
            onClose={() => setModalOpen(false)}
            onSubmit={onCreateDownload}
          />
        </>
      ) : activeSection === "Settings" ? (
        <SettingsPage
          settings={settings}
          busy={settingsBusy}
          onChange={onSettingsChange}
          onRunProfiler={onRunProfiler}
          onRefreshProfilerStatus={onRefreshProfilerStatus}
          onRestoreRecommended={onRestoreRecommended}
          onOpenProfilerTab={() => setActiveSection("Profiler")}
        />
      ) : activeSection === "Profiler" ? (
        <ProfilerPage
          settings={settings}
          busy={settingsBusy}
          onRunProfiler={onRunProfiler}
          onCancelProfiler={onCancelProfiler}
          onRefreshProfilerStatus={onRefreshProfilerStatus}
          onRestoreRecommended={onRestoreRecommended}
        />
      ) : activeSection === "History" ? (
        <section className="space-y-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">History</h2>
            <span className="text-xs text-slate-500">{historyDownloads.length}</span>
          </div>
          {historyDownloads.length === 0 ? (
            <EmptyState title="No download history" hint="Completed, failed, cancelled, and other records appear here." />
          ) : (
            historyDownloads.map((download) => (
              <DownloadRow
                key={download.id}
                download={download}
                isCompleted={download.state === "completed"}
                onSelect={setHistoryDetails}
                busy={busyIds.has(download.id)}
                onPause={onPause}
                onResume={onResume}
                onCancel={onCancel}
                onDelete={onDelete}
              />
            ))
          )}
        </section>
      ) : activeSection === "Diagnostics" ? (
        <DiagnosticsPage
          diagnostics={diagnostics}
          onCopyDiagnostics={onCopyDiagnostics}
          frontendBuildCommit={frontendBuildCommit}
          frontendBuildTime={frontendBuildTime}
          backendBuildCommit={runtimeBuildInfo?.backend_build_commit}
          backendBuildUnix={runtimeBuildInfo?.backend_build_unix}
        />
      ) : activeSection === "About" ? (
        <AboutPage
          appVersion={appVersion}
          agentStatus={agentStatus}
          runtimeBuildInfo={runtimeBuildInfo}
          frontendBuildCommit={frontendBuildCommit}
          frontendBuildTime={frontendBuildTime}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-400">
          {activeSection} section is reserved for upcoming releases.
        </div>
      )}
      <DownloadHistoryDetailsModal
        open={historyDetails != null}
        download={historyDetails}
        onClose={() => setHistoryDetails(null)}
        onNotify={onNotify}
      />
    </AppShell>
  );
}
