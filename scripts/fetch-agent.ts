import { chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

type QdmConfig = { quickgetRepo: string; quickgetAgentVersion: string; agentPort: number; agentHost: string };
type PlatformInfo = { os: "windows" | "macos" | "linux"; arch: "x64" | "arm64"; tauriTarget: string; localAgentName: string; releaseHints: string[] };
const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

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

const loadConfig = async (): Promise<QdmConfig> => JSON.parse(await readFile(resolve("qdm.config.json"), "utf8"));
const sidecarFileName = (target: string) => `quickget-agent-${target}${process.platform === "win32" ? ".exe" : ""}`;

async function copyLocalAgent(info: PlatformInfo, outPath: string): Promise<boolean> {
  const forceLocal = process.env.QDM_USE_LOCAL_AGENT === "1";
  if (!forceLocal) return false;
  const candidates = [resolve("..", "QuickGet_CLI", info.localAgentName), resolve("..", "QuickGet _CLI", info.localAgentName)];
  for (const c of candidates) {
    try { await copyFile(c, outPath); return true; } catch {}
  }
  throw new Error(`QDM_USE_LOCAL_AGENT=1 but local agent not found. Checked: ${candidates.join(", ")}`);
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

async function downloadFromGithub(config: QdmConfig, info: PlatformInfo, outPath: string): Promise<{ releaseTag: string; assetName: string }> {
  const releasePath = config.quickgetAgentVersion === "latest" ? "latest" : `tags/${config.quickgetAgentVersion}`;
  const url = `https://api.github.com/repos/${config.quickgetRepo}/releases/${releasePath}`;
  const releaseRes = await fetch(url, { headers: githubHeaders() });
  if (!releaseRes.ok) throw new Error(`Failed to fetch release metadata (${releaseRes.status})`);
  const release = (await releaseRes.json()) as { tag_name?: string; assets: Array<{ browser_download_url: string; name: string }> };

  const asset = release.assets.find((a) => {
    const n = a.name.toLowerCase();
    return info.releaseHints.every((h) => n.includes(h)) && (n.includes("quickget-agent") || n.includes("quickget"));
  });
  if (!asset) throw new Error(`No matching quickget-agent asset found for ${info.os}/${info.arch}`);

  const tempDir = join(tmpdir(), `qdm-agent-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const archivePath = join(tempDir, asset.name);

  const assetRes = await fetch(asset.browser_download_url, { headers: githubHeaders() });
  if (!assetRes.ok || !assetRes.body) throw new Error(`Failed to download asset (${assetRes.status})`);
  await pipeline(assetRes.body as unknown as NodeJS.ReadableStream, createWriteStream(archivePath));

  if (asset.name.endsWith(".tar.gz")) {
    await runTarExtract(archivePath, tempDir);
    const targetNames = process.platform === "win32" ? ["quickget-agent.exe"] : ["quickget-agent"];
    const extracted = await findFileRecursive(tempDir, targetNames);
    if (!extracted) throw new Error("Downloaded archive does not contain quickget-agent binary. Build quickget-agent locally or set QDM_USE_LOCAL_AGENT=1.");
    const extractedStat = await stat(extracted);
    if (!extractedStat.isFile()) throw new Error("Resolved extracted quickget-agent path is not a file");
    await copyFile(extracted, outPath);
  } else {
    await copyFile(archivePath, outPath);
  }
  return { releaseTag: release.tag_name ?? config.quickgetAgentVersion, assetName: asset.name };
}

async function main() {
  const config = await loadConfig();
  const info = getPlatformInfo();
  const outPath = resolve("src-tauri", "binaries", sidecarFileName(info.tauriTarget));
  await mkdir(dirname(outPath), { recursive: true });

  const usedLocal = await copyLocalAgent(info, outPath);
  let source = "local";
  let releaseTag = "local";
  let assetName = info.localAgentName;
  if (!usedLocal) {
    const downloadMeta = await downloadFromGithub(config, info, outPath);
    source = "github";
    releaseTag = downloadMeta.releaseTag;
    assetName = downloadMeta.assetName;
  }
  if (process.platform !== "win32") await chmod(outPath, 0o755);

  await writeFile(
    resolve("src-tauri", "binaries", "quickget-agent.meta.json"),
    JSON.stringify(
      {
        source,
        releaseTag,
        assetName,
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
  console.log(`quickget-agent ready at ${basename(outPath)} (${source}) tag=${releaseTag} asset=${assetName}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
