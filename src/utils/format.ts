export function formatBytes(value?: number | null): string {
  if (value == null || Number.isNaN(value) || value < 0) return "--";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** power;
  return `${size.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

export function formatSpeedMBps(bytesPerSec?: number | null): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "--";
  const megabytesPerSecond = bytesPerSec / (1024 * 1024);
  return `${megabytesPerSecond.toFixed(2)} MB/s`;
}

export const formatSpeedMbps = formatSpeedMBps;

export function formatPercent(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "--";
  const clamped = Math.max(0, Math.min(100, value));
  return `${clamped.toFixed(1)}%`;
}

export function formatEta(totalBytes?: number | null, downloadedBytes?: number | null, bytesPerSec?: number | null): string {
  if (!totalBytes || !downloadedBytes || !bytesPerSec || bytesPerSec <= 0) return "--";
  const remaining = totalBytes - downloadedBytes;
  if (remaining <= 0) return "0s";
  const seconds = Math.ceil(remaining / bytesPerSec);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

export function formatEtaLabel(totalBytes?: number | null, downloadedBytes?: number | null, bytesPerSec?: number | null): string {
  const eta = formatEta(totalBytes, downloadedBytes, bytesPerSec);
  if (eta === "--") return "ETA: calculating...";
  if (eta === "0s") return "ETA: finishing...";
  return `ETA: ${eta} left`;
}

export function formatDuration(from?: string | null, to?: string | null): string {
  if (!from) return "--";
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return "--";
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(end.getTime())) return "--";
  let seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${remSeconds}s`;
  if (minutes > 0) return `${minutes}m ${remSeconds}s`;
  return `${remSeconds}s`;
}
