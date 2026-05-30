use tauri::{
    menu::{Menu, MenuItem},
    PhysicalPosition, PhysicalSize,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

const MIN_WINDOW_WIDTH: u32 = 320;
const MIN_WINDOW_HEIGHT: u32 = 420;
const MAX_WIDGET_WIDTH: u32 = 720;
const MAX_WIDGET_HEIGHT: u32 = 880;
const SCREEN_MARGIN: u32 = 80;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
    }
}

fn clamp_u32(value: u32, min: u32, max: u32) -> u32 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
    }
}

fn recover_window_geometry(window: WindowGeometry, screen: WindowGeometry) -> WindowGeometry {
    let max_width =
        MAX_WIDGET_WIDTH.min(screen.width.saturating_sub(SCREEN_MARGIN).max(MIN_WINDOW_WIDTH));
    let max_height =
        MAX_WIDGET_HEIGHT.min(screen.height.saturating_sub(SCREEN_MARGIN).max(MIN_WINDOW_HEIGHT));
    let width = clamp_u32(window.width, MIN_WINDOW_WIDTH.min(max_width), max_width);
    let height = clamp_u32(window.height, MIN_WINDOW_HEIGHT.min(max_height), max_height);
    let max_x = screen.x + screen.width as i32 - width as i32;
    let max_y = screen.y + screen.height as i32 - height as i32;

    WindowGeometry {
        x: clamp_i32(window.x, screen.x, max_x),
        y: clamp_i32(window.y, screen.y, max_y),
        width,
        height,
    }
}

fn recover_main_window_geometry<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let position = window.outer_position()?;
    let size = window.outer_size()?;
    let monitor = window
        .current_monitor()?
        .or(app.primary_monitor()?)
        .or_else(|| app.available_monitors().ok().and_then(|mut monitors| monitors.pop()));

    let Some(monitor) = monitor else {
        return Ok(());
    };
    let screen_position = monitor.position();
    let screen_size = monitor.size();
    let recovered = recover_window_geometry(
        WindowGeometry {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
        WindowGeometry {
            x: screen_position.x,
            y: screen_position.y,
            width: screen_size.width,
            height: screen_size.height,
        },
    );

    if recovered.width != size.width || recovered.height != size.height {
        window.set_size(PhysicalSize {
            width: recovered.width,
            height: recovered.height,
        })?;
    }

    if recovered.x != position.x || recovered.y != position.y {
        window.set_position(PhysicalPosition {
            x: recovered.x,
            y: recovered.y,
        })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_restored_window_size_to_widget_bounds() {
        let recovered = recover_window_geometry(
            WindowGeometry {
                x: 293,
                y: -1416,
                width: 788,
                height: 1427,
            },
            WindowGeometry {
                x: 0,
                y: 0,
                width: 1707,
                height: 960,
            },
        );

        assert_eq!(recovered.width, 720);
        assert_eq!(recovered.height, 880);
        assert_eq!(recovered.y, 0);
    }
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            setup_tray(app)?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                std::thread::sleep(std::time::Duration::from_millis(300));
                let _ = recover_main_window_geometry(&app_handle);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running edge todos");
}
