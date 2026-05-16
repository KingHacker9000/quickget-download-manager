use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::agent_config::{AGENT_HOST, AGENT_PORT};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::time::sleep;

const AGENT_BOOT_TIMEOUT: Duration = Duration::from_secs(15);
const AGENT_BOOT_POLL: Duration = Duration::from_millis(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
  pub running: bool,
  pub base_url: String,
  pub version: Option<String>,
  pub api_version: Option<String>,
  pub message: String,
}

#[derive(Debug, Deserialize)]
struct HealthResponse {
  version: Option<String>,
  api_version: Option<String>,
}

pub struct AgentManager {
  child: Mutex<Option<CommandChild>>,
}

impl AgentManager {
  pub fn new() -> Self {
    Self {
      child: Mutex::new(None),
    }
  }
}

pub async fn get_agent_status() -> Result<AgentStatus, String> {
  match fetch_health().await {
    Ok(health) => Ok(to_connected_status(health, "connected".to_string())),
    Err(_) => Ok(AgentStatus {
      running: false,
      base_url: agent_base_url(),
      version: None,
      api_version: None,
      message: "agent offline".to_string(),
    }),
  }
}

pub async fn ensure_agent_running(app: &tauri::AppHandle) -> Result<AgentStatus, String> {
  if let Ok(health) = fetch_health().await {
    return Ok(to_connected_status(health, "connected".to_string()));
  }

  let state = app.state::<AgentManager>();
  {
    let mut child_guard = state
      .child
      .lock()
      .map_err(|_| "failed to lock agent process state".to_string())?;
    if child_guard.is_none() {
      let mut sidecar = app
        .shell()
        .sidecar("quickget-agent")
        .map_err(|e| format!("failed to prepare quickget-agent sidecar: {e}"))?;
      let addr = format!("{}:{}", AGENT_HOST, AGENT_PORT);
      sidecar = sidecar.args(["serve", "-addr", &addr, "-v"]);
      log::info!("launching sidecar command: quickget-agent serve -addr {addr} -v");
      let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("failed to start quickget-agent sidecar: {e}"))?;
      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          log::info!("quickget-agent sidecar event: {:?}", event);
        }
      });
      *child_guard = Some(child);
    }
  }

  match wait_for_health().await {
    Ok(status) => Ok(status),
    Err(health_error) => {
      log::warn!(
        "quickget-agent startup health wait failed for {}: {health_error}",
        agent_health_url()
      );
      Err(format!(
        "Agent server started but /health did not respond on {}. Last error: {health_error}",
        agent_base_url()
      ))
    }
  }
}

pub fn stop_agent(app: &tauri::AppHandle) -> Result<(), String> {
  let state = app.state::<AgentManager>();
  let mut child_guard = state
    .child
    .lock()
    .map_err(|_| "failed to lock agent process state".to_string())?;
  if let Some(child) = child_guard.take() {
    let _ = child.kill();
  }
  Ok(())
}

pub fn get_agent_base_url() -> String {
  agent_base_url()
}

pub fn get_agent_token() -> Result<String, String> {
  let token_file = resolve_token_file().ok_or_else(|| {
    "agent auth is not ready: token file not found (set QUICKGET_AGENT_TOKEN_FILE or start quickget-agent)"
      .to_string()
  })?;

  let token = std::fs::read_to_string(&token_file)
    .map_err(|e| format!("agent auth is not ready: failed to read token file: {e}"))?
    .trim()
    .to_string();

  if token.is_empty() {
    return Err("agent auth is not ready: token file is empty".to_string());
  }

  Ok(token)
}

fn to_connected_status(health: HealthResponse, message: String) -> AgentStatus {
  AgentStatus {
    running: true,
    base_url: agent_base_url(),
    version: health.version,
    api_version: health.api_version,
    message,
  }
}

async fn wait_for_health() -> Result<AgentStatus, String> {
  let start = Instant::now();
  let mut last_error: Option<String> = None;
  loop {
    match fetch_health().await {
      Ok(health) => return Ok(to_connected_status(health, "connected".to_string())),
      Err(error) => {
        last_error = Some(error);
        log::warn!(
          "health check retry for {}: {}",
          agent_health_url(),
          last_error.as_deref().unwrap_or("unknown")
        );
      }
    }
    if start.elapsed() > AGENT_BOOT_TIMEOUT {
      return Err(format!(
        "quickget-agent did not become healthy in time (url: {}, last error: {})",
        agent_health_url(),
        last_error.as_deref().unwrap_or("unknown")
      ));
    }
    sleep(AGENT_BOOT_POLL).await;
  }
}

async fn fetch_health() -> Result<HealthResponse, String> {
  let client = reqwest::Client::new();
  let response = client
    .get(agent_health_url())
    .send()
    .await
    .map_err(|e| format!("failed to reach quickget-agent health endpoint: {e}"))?;

  if response.status() != StatusCode::OK {
    return Err(format!(
      "quickget-agent health endpoint returned {}",
      response.status()
    ));
  }

  response
    .json::<HealthResponse>()
    .await
    .map_err(|e| format!("invalid quickget-agent health response: {e}"))
}

fn resolve_token_file() -> Option<PathBuf> {
  if let Ok(explicit_path) = std::env::var("QUICKGET_AGENT_TOKEN_FILE") {
    let path = PathBuf::from(explicit_path);
    if path.exists() {
      return Some(path);
    }
  }

  let mut candidates = Vec::<PathBuf>::new();

  if let Some(local_data) = dirs::data_local_dir() {
    candidates.push(local_data.join("quickget-agent").join("token"));
    candidates.push(local_data.join("QuickGet").join("quickget-agent.token"));
  }
  if let Some(config_dir) = dirs::config_dir() {
    candidates.push(config_dir.join("quickget-agent").join("token"));
    candidates.push(config_dir.join("QuickGet").join("agent-token"));
    candidates.push(config_dir.join("QuickGet").join("quickget-agent.token"));
  }
  if let Some(home_dir) = dirs::home_dir() {
    candidates.push(home_dir.join(".quickget-agent").join("token"));
  }

  candidates.into_iter().find(|p| p.exists())
}

fn agent_base_url() -> String {
  format!("http://{}:{}", AGENT_HOST, AGENT_PORT)
}

fn agent_health_url() -> String {
  format!("{}/health", agent_base_url())
}
