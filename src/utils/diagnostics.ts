export type DiagnosticLevel = "info" | "warn" | "error";
export type DiagnosticSource = "ui" | "agent" | "system";

export type DiagnosticEntry = {
  id: number;
  at: string;
  level: DiagnosticLevel;
  source: DiagnosticSource;
  message: string;
  details?: Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERN = /(authorization|token|secret|cookie|api[-_]?key|password)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi;
const TOKEN_VALUE_PATTERN = /(["']?(token|authorization)["']?\s*[:=]\s*["'])[^"']+(["'])/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(TOKEN_VALUE_PATTERN, "$1[redacted]$3");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(source)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeValue(nested);
    }
    return out;
  }
  return value;
}

export function sanitizeDiagnostic(entry: DiagnosticEntry): DiagnosticEntry {
  return {
    ...entry,
    message: redactSensitiveText(entry.message),
    details: entry.details ? (sanitizeValue(entry.details) as Record<string, unknown>) : undefined,
  };
}

export function formatDiagnosticsReport(input: {
  appName: string;
  appVersion: string;
  agentState: string;
  agentVersion?: string | null;
  agentApiVersion?: string | null;
  diagnostics: DiagnosticEntry[];
}): string {
  const payload = {
    app: {
      name: input.appName,
      version: input.appVersion,
    },
    agent: {
      state: input.agentState,
      version: input.agentVersion ?? null,
      apiVersion: input.agentApiVersion ?? null,
    },
    generatedAt: new Date().toISOString(),
    events: input.diagnostics.map((entry) => sanitizeDiagnostic(entry)),
  };
  return JSON.stringify(payload, null, 2);
}

