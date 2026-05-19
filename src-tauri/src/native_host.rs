use std::path::PathBuf;

use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::native_host_config::EXTENSION_ORIGINS;

#[cfg(target_arch = "x86_64")]
const SIDECAR_HOST_FILE: &str = "quickget-native-host-x86_64-pc-windows-msvc.exe";
#[cfg(target_arch = "aarch64")]
const SIDECAR_HOST_FILE: &str = "quickget-native-host-aarch64-pc-windows-msvc.exe";
#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
const SIDECAR_HOST_FILE: &str = "quickget-native-host.exe";
const SIDECAR_HOST_FALLBACK_FILE: &str = "quickget-native-host.exe";

pub async fn ensure_registered(app: &tauri::AppHandle) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Ok(());
    }
    if EXTENSION_ORIGINS.is_empty() {
        return Err("extensionOrigins is empty; configure qdm.config.json".to_string());
    }
    let sidecar_path = resolve_native_host_sidecar_path(app)?;
    let sidecar_path_arg = sidecar_path.to_string_lossy().to_string();

    let mut cmd = app
        .shell()
        .sidecar("quickget-native-host")
        .map_err(|e| format!("failed to prepare quickget-native-host sidecar: {e}"))?;
    cmd = cmd.args(["install-chrome", "-path", &sidecar_path_arg]);
    for origin in EXTENSION_ORIGINS {
        cmd = cmd.args(["-origin", origin]);
    }

    let (mut rx, _child) = cmd
        .spawn()
        .map_err(|e| format!("failed to launch quickget-native-host installer: {e}"))?;

    let mut stderr = String::new();
    let mut exit_code: Option<i32> = None;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => stderr.push_str(&String::from_utf8_lossy(&bytes)),
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    if exit_code.unwrap_or(1) == 0 {
        return Ok(());
    }
    let msg = stderr.trim();
    if msg.is_empty() {
        return Err(format!(
            "quickget-native-host install-chrome failed (path={sidecar_path_arg}, origins={})",
            EXTENSION_ORIGINS.join(",")
        ));
    }
    Err(format!(
        "quickget-native-host install-chrome failed (path={sidecar_path_arg}, origins={}): {msg}",
        EXTENSION_ORIGINS.join(",")
    ))
}

fn resolve_native_host_sidecar_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join(SIDECAR_HOST_FILE));
        candidates.push(resource_dir.join(SIDECAR_HOST_FILE));
        candidates.push(resource_dir.join(SIDECAR_HOST_FALLBACK_FILE));
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(SIDECAR_HOST_FILE));
            candidates.push(parent.join(SIDECAR_HOST_FALLBACK_FILE));
            candidates.push(parent.join("binaries").join(SIDECAR_HOST_FILE));
            candidates.push(parent.join("binaries").join(SIDECAR_HOST_FALLBACK_FILE));
        }
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(SIDECAR_HOST_FILE),
    );
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(SIDECAR_HOST_FALLBACK_FILE),
    );

    for candidate in candidates {
        if candidate.exists() {
            return candidate.canonicalize().map(normalize_windows_path).map_err(|e| {
                format!(
                    "failed to canonicalize native host sidecar path {}: {e}",
                    candidate.display()
                )
            });
        }
    }
    Err(format!(
        "failed to resolve quickget-native-host sidecar path; checked {}",
        list_candidate_paths(app).join(", ")
    ))
}

#[cfg(target_os = "windows")]
fn normalize_windows_path(path: PathBuf) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = raw.strip_prefix(r"\\?\") {
        return PathBuf::from(rest.to_string());
    }
    path
}

#[cfg(not(target_os = "windows"))]
fn normalize_windows_path(path: PathBuf) -> PathBuf {
    path
}

fn list_candidate_paths(app: &tauri::AppHandle) -> Vec<String> {
    let mut out = Vec::<String>::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        out.push(
            resource_dir
                .join("binaries")
                .join(SIDECAR_HOST_FILE)
                .display()
                .to_string(),
        );
        out.push(resource_dir.join(SIDECAR_HOST_FILE).display().to_string());
        out.push(
            resource_dir
                .join(SIDECAR_HOST_FALLBACK_FILE)
                .display()
                .to_string(),
        );
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            out.push(parent.join(SIDECAR_HOST_FILE).display().to_string());
            out.push(
                parent
                    .join(SIDECAR_HOST_FALLBACK_FILE)
                    .display()
                    .to_string(),
            );
            out.push(
                parent
                    .join("binaries")
                    .join(SIDECAR_HOST_FILE)
                    .display()
                    .to_string(),
            );
            out.push(
                parent
                    .join("binaries")
                    .join(SIDECAR_HOST_FALLBACK_FILE)
                    .display()
                    .to_string(),
            );
        }
    }
    out.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(SIDECAR_HOST_FILE)
            .display()
            .to_string(),
    );
    out.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(SIDECAR_HOST_FALLBACK_FILE)
            .display()
            .to_string(),
    );
    out
}
