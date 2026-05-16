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
