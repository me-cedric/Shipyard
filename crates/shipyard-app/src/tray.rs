//! The menu bar item: a tray icon that opens a small panel. The panel is a second window that
//! loads the same front end at `/tray`, so it reads the same state as the main window.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::window::{Color, Effect, EffectState, EffectsBuilder};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, Window};

use crate::commands::Api;

const ID: &str = "tray";
const PANEL: (f64, f64) = (360.0, 520.0);
/// The corner radius of the panel, in points. The page uses the same value.
const RADIUS: f64 = 12.0;
/// A click on the icon blurs the panel first. A show within this time of a blur is the same click.
const BLUR_MS: u64 = 250;

/// The menu bar icon: the Shipyard mark as a black silhouette on transparent pixels. macOS draws a
/// template image in the colour of the menu bar, like the icons of the system.
const TEMPLATE: &[u8] = include_bytes!("../icons/tray-template.png");

fn template() -> Option<Image<'static>> {
    Image::from_bytes(TEMPLATE).ok()
}

/// When the panel last hid on blur, in ms since the epoch.
static BLURRED: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// The top left corner of the panel: centred on the icon, below it in the top bar and above it in
/// a bottom bar, and inside the screen. Each area is `(x, y, width, height)` in pixels.
pub fn panel_origin(
    icon: (f64, f64, f64, f64),
    panel: (f64, f64),
    screen: (f64, f64, f64, f64),
) -> (f64, f64) {
    let x = icon.0 + icon.2 / 2.0 - panel.0 / 2.0;
    let below = icon.1 + icon.3 / 2.0 < screen.1 + screen.3 / 2.0;
    let y = if below {
        icon.1 + icon.3
    } else {
        icon.1 - panel.1
    };
    (
        x.min(screen.0 + screen.2 - panel.0).max(screen.0),
        y.min(screen.1 + screen.3 - panel.1).max(screen.1),
    )
}

/// The hidden panel keeps the process alive, so the end of the main window ends the app.
/// This runs after the close guard allowed the close, so `RunEvent::Exit` cleanup still runs.
pub fn ends_app(label: &str) -> bool {
    label == "main"
}

/// A show right after a blur is the click that closes the panel.
fn opens(visible: bool, since_blur_ms: u64) -> bool {
    !visible && since_blur_ms > BLUR_MS
}

/// The panel hides when it loses focus.
pub fn on_blur(window: &Window) {
    BLURRED.store(now_ms(), Ordering::SeqCst);
    let _ = window.hide();
}

fn toggle(app: &AppHandle, icon: tauri::Rect) {
    let Some(w) = app.get_webview_window(ID) else {
        return;
    };
    if !opens(
        w.is_visible().unwrap_or(false),
        now_ms().saturating_sub(BLURRED.load(Ordering::SeqCst)),
    ) {
        let _ = w.hide();
        return;
    }
    let k = w.scale_factor().unwrap_or(1.0);
    let (p, s) = (
        icon.position.to_physical::<f64>(k),
        icon.size.to_physical::<f64>(k),
    );
    let screen = app.monitor_from_point(p.x, p.y).ok().flatten().map(|m| {
        (
            m.position().x as f64,
            m.position().y as f64,
            m.size().width as f64,
            m.size().height as f64,
        )
    });
    // The page fits the window to its content, so the height is the one of the window now.
    let size = w.outer_size().map_or((PANEL.0 * k, PANEL.1 * k), |o| {
        (o.width as f64, o.height as f64)
    });
    let at = screen.map_or((p.x, p.y + s.height), |m| {
        panel_origin((p.x, p.y, s.width, s.height), size, m)
    });
    let _ = w.set_position(PhysicalPosition::new(at.0, at.1));
    let _ = w.show();
    let _ = w.set_focus();
}

/// Shows or hides the item. The first call with `on` builds the icon and the hidden panel.
pub fn apply(app: &AppHandle, on: bool) {
    if let Some(t) = app.tray_by_id(ID) {
        let _ = t.set_visible(on);
        if !on && let Some(w) = app.get_webview_window(ID) {
            let _ = w.hide();
        }
        return;
    }
    if !on {
        return;
    }
    let mut builder = TrayIconBuilder::with_id(ID)
        .tooltip("Shipyard")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                toggle(tray.app_handle(), rect);
            }
        });
    if let Some(icon) = template().or_else(|| app.default_window_icon().cloned()) {
        builder = builder.icon(icon).icon_as_template(true);
    }
    let panel = WebviewWindowBuilder::new(app, ID, WebviewUrl::App("tray".into()))
        .inner_size(PANEL.0, PANEL.1)
        .decorations(false)
        // A clear window over the blur of the system: the page draws the rounded edge.
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .effects(
            EffectsBuilder::new()
                .effect(Effect::Popover)
                .state(EffectState::Active)
                .radius(RADIUS)
                .build(),
        )
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build();
    if let Err(e) = panel.and_then(|_| builder.build(app).map(|_| ())) {
        crate::applog::record("error", &format!("menu bar item: {e}"));
    }
}

/// Hide the panel. The Escape key calls it.
#[tauri::command]
#[specta::specta]
pub async fn tray_close(app: AppHandle) -> Api<()> {
    if let Some(w) = app.get_webview_window(ID) {
        let _ = w.hide();
    }
    Ok(())
}

/// Open Shipyard: show the main window and hide the panel.
#[tauri::command]
#[specta::specta]
pub async fn tray_open(app: AppHandle) -> Api<()> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    if let Some(w) = app.get_webview_window(ID) {
        let _ = w.hide();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_panel_sits_under_a_top_icon_and_above_a_bottom_icon() {
        let screen = (0.0, 0.0, 1920.0, 1080.0);
        let panel = (360.0, 480.0);
        // Top bar: below the icon, centred.
        assert_eq!(
            panel_origin((1000.0, 0.0, 30.0, 24.0), panel, screen),
            (835.0, 24.0)
        );
        // Bottom bar: above the icon.
        assert_eq!(
            panel_origin((1000.0, 1050.0, 30.0, 30.0), panel, screen),
            (835.0, 570.0)
        );
        // Right edge: inside the screen.
        assert_eq!(
            panel_origin((1900.0, 0.0, 20.0, 24.0), panel, screen).0,
            1560.0
        );
    }

    #[test]
    fn only_the_end_of_the_main_window_ends_the_app() {
        assert!(ends_app("main"));
        assert!(!ends_app(ID));
    }

    #[test]
    fn a_click_that_blurred_the_panel_does_not_open_it_again() {
        assert!(opens(false, 1000));
        assert!(!opens(false, 50));
        assert!(!opens(true, 1000));
    }

    #[test]
    fn the_menu_bar_icon_is_a_square_silhouette_with_clear_pixels() {
        let icon = template().expect("the template icon reads");
        assert_eq!((icon.width(), icon.height()), (64, 64));
        let px = icon.rgba();
        // Only black and transparent pixels: macOS tints the shape.
        assert!(
            px.chunks(4)
                .all(|p| p[3] == 0 || (p[0] < 40 && p[1] < 40 && p[2] < 40))
        );
        assert!(px.chunks(4).any(|p| p[3] == 0) && px.chunks(4).any(|p| p[3] == 255));
    }
}
