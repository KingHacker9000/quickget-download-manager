use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  pub launch_on_startup: bool,
  pub default_download_folder: Option<String>,
  pub speed_mode: String,
  pub max_simultaneous_downloads: u32,
  pub notifications_enabled: bool,
}

impl Default for AppSettings {
  fn default() -> Self {
    Self {
      launch_on_startup: false,
      default_download_folder: dirs::download_dir().map(|p| p.to_string_lossy().to_string()),
      speed_mode: "balanced".to_string(),
      max_simultaneous_downloads: 8,
      notifications_enabled: true,
    }
  }
}

pub fn load_settings() -> Result<AppSettings, String> {
  let path = settings_file_path()?;
  if !path.exists() {
    return Ok(AppSettings::default());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("failed to read settings file: {e}"))?;
  serde_json::from_str::<AppSettings>(&raw).map_err(|e| format!("invalid settings file: {e}"))
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
  let path = settings_file_path()?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("failed to create settings directory: {e}"))?;
  }
  let raw = serde_json::to_string_pretty(settings).map_err(|e| format!("failed to encode settings: {e}"))?;
  fs::write(path, raw).map_err(|e| format!("failed to write settings file: {e}"))
}

fn settings_file_path() -> Result<PathBuf, String> {
  let config = dirs::config_dir().ok_or_else(|| "config directory not found".to_string())?;
  Ok(config.join("QuickGet").join("qdm-settings.json"))
}
