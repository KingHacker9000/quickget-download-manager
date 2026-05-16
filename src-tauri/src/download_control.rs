use crate::agent;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct AgentDownload {
  id: String,
  status: String,
}

pub async fn has_active_downloads() -> Result<bool, String> {
  let downloads = list_downloads().await?;
  Ok(downloads.iter().any(|d| matches!(d.status.as_str(), "queued" | "starting" | "running" | "downloading")))
}

pub async fn pause_all_downloads() -> Result<(), String> {
  if try_batch_action("pause-all").await? {
    return Ok(());
  }

  let downloads = list_downloads().await?;
  for d in downloads {
    if matches!(d.status.as_str(), "queued" | "starting" | "running" | "downloading") {
      let _ = post_download_action(&d.id, "pause").await;
    }
  }
  Ok(())
}

pub async fn resume_all_downloads() -> Result<(), String> {
  if try_batch_action("resume-all").await? {
    return Ok(());
  }

  let downloads = list_downloads().await?;
  for d in downloads {
    if d.status == "paused" {
      let _ = post_download_action(&d.id, "resume").await;
    }
  }
  Ok(())
}

async fn list_downloads() -> Result<Vec<AgentDownload>, String> {
  let client = reqwest::Client::new();
  let token = agent::get_agent_token()?;
  let response = client
    .get(format!("{}/downloads", agent::get_agent_base_url()))
    .bearer_auth(token)
    .send()
    .await
    .map_err(|e| format!("failed to list downloads: {e}"))?;
  if !response.status().is_success() {
    return Err(format!("failed to list downloads: {}", response.status()));
  }
  response
    .json::<Vec<AgentDownload>>()
    .await
    .map_err(|e| format!("failed to decode downloads: {e}"))
}

async fn try_batch_action(action: &str) -> Result<bool, String> {
  let client = reqwest::Client::new();
  let token = agent::get_agent_token()?;
  let response = client
    .post(format!("{}/downloads/{}", agent::get_agent_base_url(), action))
    .bearer_auth(token)
    .send()
    .await
    .map_err(|e| format!("batch action failed: {e}"))?;

  if response.status() == reqwest::StatusCode::NOT_FOUND {
    return Ok(false);
  }
  if response.status().is_success() {
    return Ok(true);
  }
  Ok(false)
}

async fn post_download_action(id: &str, action: &str) -> Result<(), String> {
  let client = reqwest::Client::new();
  let token = agent::get_agent_token()?;
  let response = client
    .post(format!(
      "{}/downloads/{}/{}",
      agent::get_agent_base_url(),
      urlencoding::encode(id),
      action
    ))
    .bearer_auth(token)
    .send()
    .await
    .map_err(|e| format!("failed {action} for download {id}: {e}"))?;

  if !response.status().is_success() {
    return Err(format!("failed {action} for download {id}: {}", response.status()));
  }
  Ok(())
}
