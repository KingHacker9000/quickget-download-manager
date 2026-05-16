use crate::agent;

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
