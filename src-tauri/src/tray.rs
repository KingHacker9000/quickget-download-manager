use crate::download_control;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Emitter, Manager};

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
  let open = MenuItem::with_id(app, "open_qdm", "Open QuickGet Download Manager", true, None::<&str>)?;
  let pause_all = MenuItem::with_id(app, "pause_all", "Pause All", true, None::<&str>)?;
  let resume_all = MenuItem::with_id(app, "resume_all", "Resume All", true, None::<&str>)?;
  let show_downloads = MenuItem::with_id(app, "show_downloads", "Show Downloads", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit_qdm", "Quit", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&open, &pause_all, &resume_all, &show_downloads, &quit])?;

  let handle = app.handle().clone();

  let mut tray_builder = TrayIconBuilder::with_id("qdm-tray")
    .menu(&menu)
    .on_menu_event(move |app, event| match event.id.as_ref() {
      "open_qdm" => {
        let _ = show_main_window(app);
      }
      "show_downloads" => {
        let _ = show_main_window(app);
        let _ = app.emit("tray://show-downloads", ());
      }
      "pause_all" => {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
          if let Err(error) = download_control::pause_all_downloads().await {
            log::warn!("pause_all from tray failed: {error}");
          } else {
            let _ = app_handle.emit("tray://downloads-paused", ());
          }
        });
      }
      "resume_all" => {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
          if let Err(error) = download_control::resume_all_downloads().await {
            log::warn!("resume_all from tray failed: {error}");
          } else {
            let _ = app_handle.emit("tray://downloads-resumed", ());
          }
        });
      }
      "quit_qdm" => {
        let _ = app.emit("app://request-quit", ());
      }
      _ => {}
    });

  if let Some(default_icon) = app.default_window_icon().cloned() {
    tray_builder = tray_builder.icon(default_icon);
  }

  tray_builder
    .on_tray_icon_event(|tray, event| {
      if matches!(
        event,
        TrayIconEvent::Click {
          button: MouseButton::Left,
          button_state: MouseButtonState::Up,
          ..
        }
      ) {
        let _ = show_main_window(tray.app_handle());
      }
    })
    .build(&handle)?;

  Ok(())
}

pub fn show_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.unminimize();
  }
  Ok(())
}
