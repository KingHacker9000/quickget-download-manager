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
