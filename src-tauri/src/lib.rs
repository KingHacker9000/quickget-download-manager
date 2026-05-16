mod agent;
mod agent_config;
mod commands;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .manage(agent::AgentManager::new())
    .invoke_handler(tauri::generate_handler![
      commands::ensure_agent_running,
      commands::get_agent_status,
      commands::get_agent_base_url,
      commands::get_agent_token,
      commands::open_downloads_folder
    ])
    .setup(|app| {
      if let Err(error) = tauri::async_runtime::block_on(agent::ensure_agent_running(app.handle()))
      {
        log::warn!("quickget-agent startup check failed: {error}");
      }
      tray::setup_tray(app)?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let tauri::RunEvent::Exit = event {
        if let Err(error) = agent::stop_agent(app_handle) {
          log::warn!("failed to stop quickget-agent on exit: {error}");
        }
      }
    });
}
