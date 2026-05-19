mod agent;
mod agent_config;
mod commands;
mod download_control;
mod native_host;
mod native_host_config;
mod settings;
mod tray;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .manage(agent::AgentManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::ensure_agent_running,
            commands::get_agent_status,
            commands::get_agent_base_url,
            commands::get_agent_token,
            commands::open_downloads_folder,
            commands::open_download_file,
            commands::open_download_folder,
            commands::reveal_download_file,
            commands::file_exists,
            commands::get_settings,
            commands::save_settings,
            commands::handle_quit_action,
            commands::has_active_downloads,
            commands::pause_all_downloads,
            commands::resume_all_downloads,
            commands::show_main_window,
            commands::show_capture_popup_window,
            commands::hide_capture_popup_window,
            commands::get_qdm_runtime_build_info,
            commands::read_latest_profiler_recommendation
        ])
        .setup(|app| {
            if let Err(error) =
                tauri::async_runtime::block_on(native_host::ensure_registered(app.handle()))
            {
                log::warn!("quickget-native-host registration check failed: {error}");
            }
            if let Err(error) =
                tauri::async_runtime::block_on(agent::ensure_agent_running(app.handle()))
            {
                log::warn!("quickget-agent startup check failed: {error}");
            }
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let settings = settings::load_settings().unwrap_or_default();
                        if settings.minimize_to_tray_on_close {
                            api.prevent_close();
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                    }
                });
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
