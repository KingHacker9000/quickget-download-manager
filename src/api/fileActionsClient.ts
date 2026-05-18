import { invoke } from "@tauri-apps/api/core";

export async function openDownloadFile(path: string): Promise<void> {
  await invoke("open_download_file", { path });
}

export async function openDownloadFolder(path: string): Promise<void> {
  await invoke("open_download_folder", { path });
}

export async function revealDownloadFile(path: string): Promise<void> {
  await invoke("reveal_download_file", { path });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>("file_exists", { path });
}
