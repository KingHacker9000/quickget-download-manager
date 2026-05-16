use crate::{agent, download_control, settings, tray};
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

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
