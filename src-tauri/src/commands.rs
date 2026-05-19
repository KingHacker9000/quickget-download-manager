use crate::{agent, download_control, settings, tray};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;
use std::path::{Path, PathBuf};

#[tauri::command]
pub async fn ensure_agent_running(app: tauri::AppHandle) -> Result<agent::AgentStatus, String> {
  agent::ensure_agent_running(&app).await
}

#[tauri::command]
pub async fn get_agent_status() -> Result<agent::AgentStatus, String> {
  agent::get_agent_status().await
}

#[tauri::command]
pub fn get_agent_base_url() -> String {
  agent::get_agent_base_url()
}

#[tauri::command]
pub fn get_agent_token() -> Result<String, String> {
  agent::get_agent_token()
}

#[tauri::command]
pub fn open_downloads_folder() -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer.exe")
      .arg(dirs::download_dir().ok_or_else(|| "downloads folder not found".to_string())?)
      .spawn()
      .map_err(|e| format!("failed to open downloads folder: {e}"))?;
    return Ok(());
  }

  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(dirs::download_dir().ok_or_else(|| "downloads folder not found".to_string())?)
      .spawn()
      .map_err(|e| format!("failed to open downloads folder: {e}"))?;
    return Ok(());
  }

  #[cfg(target_os = "linux")]
  {
    std::process::Command::new("xdg-open")
      .arg(dirs::download_dir().ok_or_else(|| "downloads folder not found".to_string())?)
      .spawn()
      .map_err(|e| format!("failed to open downloads folder: {e}"))?;
    return Ok(());
  }

  #[allow(unreachable_code)]
  Err("opening downloads folder is not supported on this platform".to_string())
}

fn normalize_local_path(path: &str) -> Result<PathBuf, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("path is required".to_string());
  }
  let candidate = Path::new(trimmed);
  let resolved = if candidate.is_absolute() {
    candidate.to_path_buf()
  } else {
    std::env::current_dir()
      .map_err(|e| format!("failed to read current dir: {e}"))?
      .join(candidate)
  };
  Ok(resolved)
}

#[tauri::command]
pub fn file_exists(path: String) -> Result<bool, String> {
  let resolved = normalize_local_path(&path)?;
  Ok(resolved.exists())
}

#[tauri::command]
pub fn open_download_file(path: String) -> Result<(), String> {
  let resolved = normalize_local_path(&path)?;
  if !resolved.is_file() {
    return Err("downloaded file does not exist".to_string());
  }
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("cmd")
      .args(["/C", "start", "", &resolved.to_string_lossy()])
      .spawn()
      .map_err(|e| format!("failed to open file: {e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&resolved)
      .spawn()
      .map_err(|e| format!("failed to open file: {e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "linux")]
  {
    std::process::Command::new("xdg-open")
      .arg(&resolved)
      .spawn()
      .map_err(|e| format!("failed to open file: {e}"))?;
    return Ok(());
  }
  #[allow(unreachable_code)]
  Err("open file is not supported on this platform".to_string())
}

#[tauri::command]
pub fn open_download_folder(path: String) -> Result<(), String> {
  let resolved = normalize_local_path(&path)?;
  let folder = if resolved.is_dir() {
    resolved
  } else {
    resolved
      .parent()
      .ok_or_else(|| "unable to resolve parent folder".to_string())?
      .to_path_buf()
  };
  if !folder.is_dir() {
    return Err("download folder does not exist".to_string());
  }
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer.exe")
      .arg(&folder)
      .spawn()
      .map_err(|e| format!("failed to open folder: {e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&folder)
      .spawn()
      .map_err(|e| format!("failed to open folder: {e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "linux")]
  {
    std::process::Command::new("xdg-open")
      .arg(&folder)
      .spawn()
      .map_err(|e| format!("failed to open folder: {e}"))?;
    return Ok(());
  }
  #[allow(unreachable_code)]
  Err("open folder is not supported on this platform".to_string())
}

#[tauri::command]
pub fn reveal_download_file(path: String) -> Result<(), String> {
  let resolved = normalize_local_path(&path)?;
  if !resolved.exists() {
    return Err("downloaded file does not exist".to_string());
  }
  #[cfg(target_os = "windows")]
  {
    let select_arg = format!("/select,{}", resolved.to_string_lossy());
    std::process::Command::new("explorer.exe")
      .arg(select_arg)
      .spawn()
      .map_err(|e| format!("failed to reveal file: {e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg("-R")
      .arg(&resolved)
      .spawn()
      .map_err(|e| format!("failed to reveal file: {e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "linux")]
  {
    let folder = resolved
      .parent()
      .ok_or_else(|| "unable to resolve parent folder".to_string())?;
    std::process::Command::new("xdg-open")
      .arg(folder)
      .spawn()
      .map_err(|e| format!("failed to open folder: {e}"))?;
    return Ok(());
  }
  #[allow(unreachable_code)]
  Err("reveal file is not supported on this platform".to_string())
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<settings::AppSettings, String> {
  let mut current = settings::load_settings()?;
  #[cfg(desktop)]
  {
    current.launch_on_startup = app
      .autolaunch()
      .is_enabled()
      .map_err(|e| format!("failed to read launch on startup state: {e}"))?;
  }
  Ok(current)
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, next: settings::AppSettings) -> Result<settings::AppSettings, String> {
  #[cfg(desktop)]
  {
    let autolaunch = app.autolaunch();
    if next.launch_on_startup {
      autolaunch
        .enable()
        .map_err(|e| format!("failed to enable launch on startup: {e}"))?;
    } else {
      autolaunch
        .disable()
        .map_err(|e| format!("failed to disable launch on startup: {e}"))?;
    }
  }

  settings::save_settings(&next)?;
  Ok(next)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum QuitAction {
  PauseAndQuit,
  KeepRunning,
  Cancel,
}

#[tauri::command]
pub async fn handle_quit_action(app: tauri::AppHandle, action: QuitAction) -> Result<(), String> {
  match action {
    QuitAction::PauseAndQuit => {
      let _ = download_control::pause_all_downloads().await;
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
      }
      app.exit(0);
    }
    QuitAction::KeepRunning => {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
      }
    }
    QuitAction::Cancel => {}
  }
  Ok(())
}

#[tauri::command]
pub async fn has_active_downloads() -> Result<bool, String> {
  download_control::has_active_downloads().await
}

#[tauri::command]
pub async fn pause_all_downloads() -> Result<(), String> {
  download_control::pause_all_downloads().await
}

#[tauri::command]
pub async fn resume_all_downloads() -> Result<(), String> {
  download_control::resume_all_downloads().await
}

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
  tray::show_main_window(&app).map_err(|e| e.to_string())
}

fn ensure_capture_popup_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
  if let Some(window) = app.get_webview_window("capture-popup") {
    return Ok(window);
  }

  log::info!("creating capture popup window");
  WebviewWindowBuilder::new(app, "capture-popup", WebviewUrl::App("index.html".into()))
    .title("QuickGet Browser Capture")
    .inner_size(760.0, 300.0)
    .min_inner_size(440.0, 220.0)
    .resizable(true)
    .always_on_top(true)
    .build()
    .map_err(|e| {
      let message = e.to_string();
      log::warn!("failed to create capture popup window: {message}");
      message
    })
}

#[tauri::command]
pub async fn show_capture_popup_window(app: tauri::AppHandle) -> Result<(), String> {
  let window = ensure_capture_popup_window(&app)?;
  if let Err(error) = window.show() {
    log::warn!("failed to show capture popup window: {error}");
  }
  if let Err(error) = window.unminimize() {
    log::warn!("failed to unminimize capture popup window: {error}");
  }
  if let Err(error) = window.set_focus() {
    log::warn!("failed to focus capture popup window: {error}");
  }
  Ok(())
}

#[tauri::command]
pub async fn hide_capture_popup_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("capture-popup") {
    if let Err(error) = window.hide() {
      log::warn!("failed to hide capture popup window: {error}");
    }
  }
  Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QdmRuntimeBuildInfo {
  pub app_version: String,
  pub backend_build_commit: String,
  pub backend_build_unix: String,
}

#[tauri::command]
pub fn get_qdm_runtime_build_info() -> QdmRuntimeBuildInfo {
  QdmRuntimeBuildInfo {
    app_version: env!("CARGO_PKG_VERSION").to_string(),
    backend_build_commit: option_env!("QDM_BACKEND_BUILD_COMMIT").unwrap_or("unknown").to_string(),
    backend_build_unix: option_env!("QDM_BACKEND_BUILD_UNIX").unwrap_or("0").to_string(),
  }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalProfilerRecommendation {
  pub connections: u32,
  pub queue_mode: bool,
  pub segment_size: u64,
  pub buffer_size: u64,
  pub http1: bool,
}

#[tauri::command]
pub fn read_latest_profiler_recommendation() -> Result<LocalProfilerRecommendation, String> {
  let cwd = std::env::current_dir().map_err(|e| format!("cwd error: {e}"))?;
  let profiles_dir = cwd.join("..").join("QuickGet_CLI").join(".quickget").join("profiles");
  let entries = std::fs::read_dir(&profiles_dir).map_err(|e| format!("profiles dir not found: {e}"))?;
  let mut latest: Option<std::path::PathBuf> = None;
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      latest = match latest {
        Some(current) => {
          let path_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
          let current_name = current.file_name().and_then(|n| n.to_str()).unwrap_or("");
          Some(if path_name > current_name { path } else { current })
        }
        None => Some(path),
      };
    }
  }
  let latest = latest.ok_or_else(|| "no profiler folders found".to_string())?;
  let summary_path = latest.join("summary.csv");
  let raw = std::fs::read_to_string(summary_path).map_err(|e| format!("summary.csv read failed: {e}"))?;
  let mut lines = raw.lines();
  let _ = lines.next();
  let first = lines.next().ok_or_else(|| "summary.csv has no data rows".to_string())?;
  let cols: Vec<&str> = first.split(',').collect();
  if cols.len() < 8 {
    return Err("summary.csv format is invalid".to_string());
  }
  let connections = cols[3].parse::<u32>().map_err(|e| format!("invalid connections: {e}"))?;
  let queue_mode = cols[4].parse::<bool>().map_err(|e| format!("invalid queue_mode: {e}"))?;
  let segment_size = cols[5].parse::<u64>().map_err(|e| format!("invalid segment_size: {e}"))?;
  let buffer_size = cols[6].parse::<u64>().map_err(|e| format!("invalid buffer_size: {e}"))?;
  let http1 = cols[7].trim().eq_ignore_ascii_case("http1");
  Ok(LocalProfilerRecommendation { connections, queue_mode, segment_size, buffer_size, http1 })
}
