import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types/settings";

export type QuitAction = "pauseAndQuit" | "keepRunning" | "cancel";

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function saveSettings(next: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("save_settings", { next });
}

export async function hasActiveDownloads(): Promise<boolean> {
  return invoke<boolean>("has_active_downloads");
}

export async function handleQuitAction(action: QuitAction): Promise<void> {
  return invoke("handle_quit_action", { action });
}
