export const REQUIRED_AGENT_API_MESSAGE = "This version of QDM requires quickget-agent API v1.";

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function isSupportedAgentApiVersion(apiVersion?: string | null): boolean {
  if (!apiVersion || !apiVersion.trim()) return true;
  const compact = normalized(apiVersion).replace(/^v/, "");
  return compact === "1" || compact.startsWith("1.");
}

export function mapFriendlyError(message: string | null | undefined): string | null {
  if (!message || !message.trim()) return null;
  const raw = message.trim();
  const lower = normalized(raw);

  if (lower.includes("requires quickget-agent api v1") || lower.includes("unsupported agent api version")) {
    return REQUIRED_AGENT_API_MESSAGE;
  }
  if (
    lower.includes("quickget-agent") &&
    (lower.includes("not found") || lower.includes("no such file") || lower.includes("cannot find"))
  ) {
    return "quickget-agent binary is missing. Reinstall or restore quickget-agent, then restart QDM.";
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) {
    return "The server is rate-limiting requests. Wait a moment and try again.";
  }
  if (
    lower.includes("range ignored") ||
    lower.includes("ignored range") ||
    (lower.includes("range") && lower.includes("unsupported")) ||
    (lower.includes("range") && lower.includes("not satisfiable"))
  ) {
    return "The server ignored byte-range requests. QuickGet will fall back to a safer download path.";
  }
  if (
    lower.includes("network") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed") ||
    lower.includes("connection reset")
  ) {
    return "Network failure detected. Check connectivity and retry.";
  }
  if (
    lower.includes("permission denied") ||
    lower.includes("access is denied")
  ) {
    return "Permission denied. Choose a folder you can write to or run with the required access.";
  }
  if (
    lower.includes("disk") ||
    lower.includes("write") ||
    lower.includes("no space left")
  ) {
    return "Disk write failure. Check folder permissions and available free space.";
  }
  if (lower.includes("manifest") || lower.includes("resume")) {
    return "Resume data is invalid or outdated. Restart the download to rebuild state.";
  }
  if (
    lower.includes("unable to connect") ||
    lower.includes("connection refused") ||
    lower.includes("health endpoint") ||
    lower.includes("agent server started but /health did not respond") ||
    lower.includes("disconnected")
  ) {
    return "quickget-agent is unavailable. Start or restart the agent, then try again.";
  }
  return raw;
}

export function toFriendlyErrorMessage(error: unknown, fallback: string): string {
  const base =
    typeof error === "string" && error.trim()
      ? error
      : error instanceof Error && error.message.trim()
        ? error.message
        : fallback;
  return mapFriendlyError(base) ?? fallback;
}
