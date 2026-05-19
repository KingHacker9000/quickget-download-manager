import { chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

type QdmConfig = {
  quickgetRepo: string;
  quickgetAgentVersion: string;
  quickgetNativeHostVersion: string;
  extensionOrigins: string[];
  agentPort: number;
  agentHost: string;
};
type PlatformInfo = { os: "windows" | "macos" | "linux"; arch: "x64" | "arm64"; tauriTarget: string; localAgentName: string; releaseHints: string[] };
const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

export function normalizeExtensionOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.startsWith("chrome-extension://")) {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  return `chrome-extension://${trimmed.replace(/^chrome-extension:\/\//, "").replace(/\/+$/, "")}/`;
}

export function normalizeExtensionOrigins(origins: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const origin of origins) {
    const normalized = normalizeExtensionOrigin(origin);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "qdm-fetch-agent",
    Accept: "application/vnd.github+json",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  return headers;
}

function getPlatformInfo(): PlatformInfo {
  const { platform, arch } = process;
  if (arch !== "x64" && arch !== "arm64") throw new Error(`Unsupported architecture: ${arch}`);
  if (platform === "win32") return { os: "windows", arch, tauriTarget: arch === "x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc", localAgentName: "quickget-agent.exe", releaseHints: ["windows", arch === "x64" ? "amd64" : "arm64"] };
  if (platform === "darwin") return { os: "macos", arch, tauriTarget: arch === "x64" ? "x86_64-apple-darwin" : "aarch64-apple-darwin", localAgentName: "quickget-agent", releaseHints: ["darwin", arch === "x64" ? "amd64" : "arm64"] };
  if (platform === "linux") return { os: "linux", arch, tauriTarget: arch === "x64" ? "x86_64-unknown-linux-gnu" : "aarch64-unknown-linux-gnu", localAgentName: "quickget-agent", releaseHints: ["linux", arch === "x64" ? "amd64" : "arm64"] };
  throw new Error(`Unsupported OS: ${platform}`);
}

const loadConfig = async (): Promise<QdmConfig> => {
  const parsed = JSON.parse(await readFile(resolve("qdm.config.json"), "utf8")) as Partial<QdmConfig>;
  return {
    quickgetRepo: parsed.quickgetRepo ?? "KingHacker9000/quickget",
    quickgetAgentVersion: parsed.quickgetAgentVersion ?? "latest",
    quickgetNativeHostVersion: parsed.quickgetNativeHostVersion ?? parsed.quickgetAgentVersion ?? "latest",
    extensionOrigins: Array.isArray(parsed.extensionOrigins) ? parsed.extensionOrigins : [],
    agentPort: parsed.agentPort ?? 19329,
    agentHost: parsed.agentHost ?? "127.0.0.1",
  };
};
const sidecarFileName = (base: string, target: string) => `${base}-${target}${process.platform === "win32" ? ".exe" : ""}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveOk) => setTimeout(resolveOk, ms));
}

async function stopWindowsAgentProcesses(): Promise<void> {
  if (process.platform !== "win32") return;
  const names = ["quickget-agent*.exe", "quickget-agent*.EXE", "quickget-agent-x86_64-pc-windows-msvc.exe", "quickget-agent-aarch64-pc-windows-msvc.exe"];
  for (const name of names) {
    await new Promise<void>((resolveOk) => {
      const proc = spawn("taskkill", ["/F", "/IM", name, "/T"]);
      proc.on("exit", () => resolveOk());
      proc.on("error", () => resolveOk());
    });
  }
}

async function copyWithLockHandling(src: string, dest: string): Promise<void> {
  const waits = [120, 300, 700];
  for (const waitMs of waits) {
    try {
      await copyFile(src, dest);
      return;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "EBUSY" && code !== "EPERM") throw error;
      await sleep(waitMs);
    }
  }
  if (process.platform === "win32") {
    await stopWindowsAgentProcesses();
    await sleep(250);
    await copyFile(src, dest);
    return;
  }
  throw new Error("Failed to copy quickget-agent binary due to file lock");
}

async function copyLocalAgent(info: PlatformInfo, outPath: string): Promise<boolean> {
  const forceLocal = process.env.QDM_USE_LOCAL_AGENT === "1";
  if (!forceLocal) return false;
  const candidates = [resolve("..", "QuickGet_CLI", info.localAgentName), resolve("..", "QuickGet _CLI", info.localAgentName)];
  for (const c of candidates) {
    try {
      await copyWithLockHandling(c, outPath);
      return true;
    } catch {
      // Try the next local candidate path.
    }
  }
  throw new Error(`QDM_USE_LOCAL_AGENT=1 but local agent not found. Checked: ${candidates.join(", ")}`);
}

async function copyLocalNativeHost(info: PlatformInfo, outPath: string): Promise<boolean> {
  const localName = info.os === "windows" ? "quickget-native-host.exe" : "quickget-native-host";
  const candidates = [
    resolve("..", "QuickGet_CLI", localName),
    resolve("..", "QuickGet_CLI", "bin", localName),
    resolve("..", "QuickGet _CLI", localName),
    resolve("..", "QuickGet _CLI", "bin", localName),
  ];
  for (const c of candidates) {
    try {
      await copyWithLockHandling(c, outPath);
      return true;
    } catch {
      // Try the next local candidate path.
    }
  }
  return false;
}

async function buildLocalNativeHost(info: PlatformInfo, outPath: string): Promise<boolean> {
  const cliCandidates = [resolve("..", "QuickGet_CLI"), resolve("..", "QuickGet _CLI")];
  let cliRoot: string | null = null;
  for (const candidate of cliCandidates) {
    try {
      const goMod = await stat(join(candidate, "go.mod"));
      if (goMod.isFile()) {
        cliRoot = candidate;
        break;
      }
    } catch {
      // Probe the next workspace candidate.
    }
  }
  if (!cliRoot) return false;

  const targetName = info.os === "windows" ? "quickget-native-host.exe" : "quickget-native-host";
  const tempOut = join(tmpdir(), `qdm-native-host-${randomUUID()}-${targetName}`);
  await new Promise<void>((resolveOk, reject) => {
    const proc = spawn("go", ["build", "-o", tempOut, "./cmd/quickget-native-host"], { cwd: cliRoot, stdio: "inherit" });
    proc.on("exit", (code) => (code === 0 ? resolveOk() : reject(new Error(`go build quickget-native-host exited with ${code}`))));
    proc.on("error", reject);
  });
  await copyWithLockHandling(tempOut, outPath);
  return true;
}

async function runTarExtract(archivePath: string, outputDir: string): Promise<void> {
  await new Promise<void>((resolveOk, reject) => {
    const proc = spawn("tar", ["-xzf", archivePath, "-C", outputDir]);
    proc.on("exit", (code) => (code === 0 ? resolveOk() : reject(new Error(`tar exited with ${code}`))));
    proc.on("error", reject);
  });
}

async function findFileRecursive(root: string, targetNames: string[]): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isFile() && targetNames.includes(entry.name.toLowerCase())) {
      return full;
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findFileRecursive(join(root, entry.name), targetNames);
    if (found) return found;
  }
  return null;
}

async function downloadFromGithub(config: QdmConfig, info: PlatformInfo, outPath: string, releaseVersion: string, binaryKind: "agent" | "native-host"): Promise<{ releaseTag: string; assetName: string }> {
  const releasePath = releaseVersion === "latest" ? "latest" : `tags/${releaseVersion}`;
  const url = `https://api.github.com/repos/${config.quickgetRepo}/releases/${releasePath}`;
  const releaseRes = await fetch(url, { headers: githubHeaders() });
  if (!releaseRes.ok) throw new Error(`Failed to fetch release metadata (${releaseRes.status})`);
  const release = (await releaseRes.json()) as { tag_name?: string; assets: Array<{ browser_download_url: string; name: string }> };

  const asset = release.assets.find((a) => {
    const n = a.name.toLowerCase();
    const matchesKind = binaryKind === "agent"
      ? (n.includes("quickget-agent") || n.includes("quickget"))
      : n.includes("quickget-native-host");
    return info.releaseHints.every((h) => n.includes(h)) && matchesKind;
  });
  if (!asset) throw new Error(`No matching ${binaryKind} asset found for ${info.os}/${info.arch}`);

  const tempDir = join(tmpdir(), `qdm-agent-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const archivePath = join(tempDir, asset.name);

  const assetRes = await fetch(asset.browser_download_url, { headers: githubHeaders() });
  if (!assetRes.ok || !assetRes.body) throw new Error(`Failed to download asset (${assetRes.status})`);
  await pipeline(assetRes.body as unknown as NodeJS.ReadableStream, createWriteStream(archivePath));

  if (asset.name.endsWith(".tar.gz")) {
    await runTarExtract(archivePath, tempDir);
    const targetNames = binaryKind === "agent"
      ? (process.platform === "win32" ? ["quickget-agent.exe"] : ["quickget-agent"])
      : (process.platform === "win32" ? ["quickget-native-host.exe"] : ["quickget-native-host"]);
    const extracted = await findFileRecursive(tempDir, targetNames);
    if (!extracted) throw new Error(`Downloaded archive does not contain ${binaryKind} binary. Build locally or set QDM_USE_LOCAL_AGENT=1.`);
    const extractedStat = await stat(extracted);
    if (!extractedStat.isFile()) throw new Error(`Resolved extracted ${binaryKind} path is not a file`);
    await copyWithLockHandling(extracted, outPath);
  } else {
    await copyWithLockHandling(archivePath, outPath);
  }
  return { releaseTag: release.tag_name ?? releaseVersion, assetName: asset.name };
}

async function main() {
  const config = await loadConfig();
  const info = getPlatformInfo();
  const agentOutPath = resolve("src-tauri", "binaries", sidecarFileName("quickget-agent", info.tauriTarget));
  const hostOutPath = resolve("src-tauri", "binaries", sidecarFileName("quickget-native-host", info.tauriTarget));
  await mkdir(dirname(agentOutPath), { recursive: true });

  const usedLocal = await copyLocalAgent(info, agentOutPath);
  let source = "local";
  let releaseTag = "local";
  let assetName = info.localAgentName;
  if (!usedLocal) {
    const downloadMeta = await downloadFromGithub(config, info, agentOutPath, config.quickgetAgentVersion, "agent");
    source = "github";
    releaseTag = downloadMeta.releaseTag;
    assetName = downloadMeta.assetName;
  }
  if (process.platform !== "win32") await chmod(agentOutPath, 0o755);

  const usedLocalHost = await copyLocalNativeHost(info, hostOutPath);
  let hostSource = "local";
  let hostReleaseTag = "local";
  let hostAssetName = info.os === "windows" ? "quickget-native-host.exe" : "quickget-native-host";
  if (!usedLocalHost) {
    try {
      const downloadMeta = await downloadFromGithub(config, info, hostOutPath, config.quickgetNativeHostVersion, "native-host");
      hostSource = "github";
      hostReleaseTag = downloadMeta.releaseTag;
      hostAssetName = downloadMeta.assetName;
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      if (!message.includes("No matching native-host asset found")) throw error;
      const copied = await copyLocalNativeHost(info, hostOutPath);
      if (copied) {
        hostSource = "local";
        hostReleaseTag = "local";
        hostAssetName = info.os === "windows" ? "quickget-native-host.exe" : "quickget-native-host";
      } else {
        const built = await buildLocalNativeHost(info, hostOutPath);
        if (!built) throw error;
        hostSource = "built-local";
        hostReleaseTag = "workspace";
        hostAssetName = info.os === "windows" ? "quickget-native-host.exe" : "quickget-native-host";
      }
    }
  }
  if (process.platform !== "win32") await chmod(hostOutPath, 0o755);

  await writeFile(
    resolve("src-tauri", "binaries", "quickget-agent.meta.json"),
    JSON.stringify(
      {
        source,
        releaseTag,
        assetName,
        nativeHost: {
          source: hostSource,
          releaseTag: hostReleaseTag,
          assetName: hostAssetName,
        },
        fetchedAt: new Date().toISOString(),
        configuredVersion: config.quickgetAgentVersion,
      },
      null,
      2,
    ),
  );

  await writeFile(resolve("src", "api", "agentConfig.ts"), `export const AGENT_HOST = "${config.agentHost}";\nexport const AGENT_PORT = ${config.agentPort};\n`);
  await writeFile(
    resolve("src-tauri", "src", "agent_config.rs"),
    `pub const AGENT_HOST: &str = "${config.agentHost}";\npub const AGENT_PORT: u16 = ${config.agentPort};\n`,
  );
  const normalizedOrigins = normalizeExtensionOrigins(config.extensionOrigins);
  await writeFile(
    resolve("src-tauri", "src", "native_host_config.rs"),
    `pub const EXTENSION_ORIGINS: &[&str] = &[\n${normalizedOrigins.map((origin) => `  "${origin}",`).join("\n")}\n];\n`,
  );

  console.log(`quickget-agent ready at ${basename(agentOutPath)} (${source}) tag=${releaseTag} asset=${assetName}`);
  console.log(`quickget-native-host ready at ${basename(hostOutPath)} (${hostSource}) tag=${hostReleaseTag} asset=${hostAssetName}`);
  if (normalizedOrigins.length === 0) {
    console.warn("warning: extensionOrigins is empty in qdm.config.json; native host auto-registration will be skipped.");
  }
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
