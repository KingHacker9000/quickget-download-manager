use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn read_git_commit() -> String {
  Command::new("git")
    .args(["rev-parse", "--short", "HEAD"])
    .output()
    .ok()
    .and_then(|out| {
      if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
      } else {
        None
      }
    })
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| "unknown".to_string())
}

fn build_timestamp() -> String {
  match SystemTime::now().duration_since(UNIX_EPOCH) {
    Ok(duration) => duration.as_secs().to_string(),
    Err(_) => "0".to_string(),
  }
}

fn main() {
  println!("cargo:rustc-env=QDM_BACKEND_BUILD_COMMIT={}", read_git_commit());
  println!("cargo:rustc-env=QDM_BACKEND_BUILD_UNIX={}", build_timestamp());
  tauri_build::build()
}
