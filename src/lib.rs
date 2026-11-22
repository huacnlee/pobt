//! pobt: Path of Building with its interface translated, hosted in a
//! Native Shell window. POB's Lua runs on its own thread (`host`); the
//! `PobCanvas` component draws its frames and sends it the mouse and keys.
//! The rest of the UI is `App.tsx`, over the `Pob` module.

pub mod dds;
pub mod frame;
pub mod host;
pub mod images;
pub mod lua;
pub mod settings;
pub mod text;
pub mod translate;
pub mod trs;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex, atomic::Ordering},
    time::Duration,
};

use nsh_core::{
    canvas::CanvasTextBaseline,
    desktop::WindowAttributes,
    element::desktop::current_window,
    geometry::ScaledPixels,
    keymap::Modifiers,
    prelude::*,
};

use crate::{
    frame::{Cmd, Frame},
    host::{Input, Shared},
    settings::{Game, Settings},
};

#[native_module("pobt/native")]
fn native(registry: &mut Registry) {
    registry.register::<PobCanvas>().module::<Pob>();
}

/// The running POB, and its thread.
static SESSION: Mutex<Option<(Arc<Shared>, std::thread::JoinHandle<()>)>> = Mutex::new(None);

fn session() -> Option<Arc<Shared>> {
    SESSION.lock().unwrap().as_ref().map(|(s, _)| s.clone())
}

/// Starts POBT again, as a new process, and ends this one.
fn relaunch() {
    if let Ok(exe) = std::env::current_exe() {
        match std::process::Command::new(exe).spawn() {
            Ok(_) => std::process::exit(0),
            Err(e) => log::error!("relaunching: {e}"),
        }
    }
}

fn game_of(name: &str) -> Game {
    if name == "poe2" { Game::Poe2 } else { Game::Poe1 }
}

/// Path of Building: its installs, the translations, and starting it.
#[module]
pub struct Pob;

#[module]
impl Pob {
    /// The saved settings as JSON: `{ poe1_dir, poe2_dir, game, language }`
    /// (`game` is `"Poe1"` or `"Poe2"`; dirs and language may be null).
    pub fn settings() -> String {
        serde_json::to_string(&Settings::load()).unwrap_or_default()
    }

    /// Saves settings given as the JSON `settings()` returns.
    pub fn save_settings(json: String) {
        if let Ok(s) = serde_json::from_str::<Settings>(&json) {
            s.save();
        }
    }

    /// The translations available, as JSON `[{ name, value }]`.
    pub fn languages() -> String {
        let list: Vec<_> = trs::languages()
            .into_iter()
            .map(|l| serde_json::json!({ "name": l.name, "value": l.value }))
            .collect();
        serde_json::to_string(&list).unwrap_or_default()
    }

    /// Whether `dir` is a Path of Building install of `game` (`"poe1"` or
    /// `"poe2"`).
    pub fn is_pob_dir(dir: String, game: String) -> bool {
        settings::is_pob_dir(std::path::Path::new(&dir), game_of(&game))
    }

    /// Asks for a folder; its path, or "" when cancelled.
    pub async fn pick_dir() -> String {
        match pick_paths(nsh_core::file_dialog::OpenDialog::folders()).await {
            Ok(Some(paths)) => paths.into_iter().next().map(|p| p.display().to_string()).unwrap_or_default(),
            _ => String::new(),
        }
    }

    /// Starts POB from `dir` translated to `language` ("" for none); an
    /// error message, or "" once it runs. A process loads one POB's Lua (and
    /// its native modules) for good: another one starts in a new POBT.
    pub fn start(dir: String, language: String) -> String {
        if session().is_some() {
            return String::new();
        }
        if lua::loaded_from().is_some_and(|d| d != std::path::Path::new(&dir)) {
            relaunch();
        }
        load_dictionary((!language.is_empty()).then_some(language));
        let shared = Shared::new();
        match host::start(PathBuf::from(dir), shared.clone()) {
            Ok(thread) => {
                *SESSION.lock().unwrap() = Some((shared, thread));
                String::new()
            }
            Err(e) => e,
        }
    }

    /// The `Assets` folder of an installed Path of Building, with forward
    /// slashes: Path of Exile's own interface art, which the launcher
    /// draws with. "" when there is none.
    pub fn assets_dir() -> String {
        let s = Settings::load();
        [s.poe1_dir, s.poe2_dir]
            .into_iter()
            .flatten()
            .map(|d| d.join("Assets"))
            .find(|d| d.join("keystonepassiveheaderleft.png").is_file())
            .map(|d| d.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default()
    }

    /// Opens `url` in the browser, off the UI thread (NSH's `openUrl` runs the
    /// shell on it, whose message loop can re-enter the window mid-update).
    pub fn open_url(url: String) {
        std::thread::spawn(move || {
            if let Err(e) = host::open_url(&url) {
                log::warn!("opening {url}: {e}");
            }
        });
    }

    /// Asks POB to quit, back to the launcher: it does once its `CanExit`
    /// agrees, or asks about unsaved changes first. `left` says when it did.
    pub fn leave() {
        if let Some(s) = session() {
            s.to_launcher.store(true, Ordering::SeqCst);
            s.quit.store(true, Ordering::SeqCst);
            s.poke.store(true, Ordering::SeqCst);
        }
    }

    /// After `leave`: "waiting" while POB decides, "stayed" while it has not
    /// quit (it asks about unsaved changes, and may quit after), "left" once it
    /// quit.
    pub fn left() -> String {
        let mut session = SESSION.lock().unwrap();
        let Some((shared, _)) = session.as_ref() else {
            return "left".into();
        };
        if shared.exited.load(Ordering::SeqCst) {
            if let Some((_, thread)) = session.take() {
                let _ = thread.join();
            }
            "left".into()
        } else if shared.quit.load(Ordering::SeqCst) {
            "waiting".into()
        } else {
            "stayed".into()
        }
    }

    /// Switches the translation on or off while POB runs.
    pub fn set_translate(on: bool) {
        if let Some(s) = session() {
            s.translate.store(on, Ordering::SeqCst);
            s.poke.store(true, Ordering::SeqCst);
        }
    }

    /// Whether the translation is on.
    pub fn translating() -> bool {
        session().is_some_and(|s| s.translate.load(Ordering::SeqCst))
    }
}

/// Loads the dictionary of `language` in the background.
fn load_dictionary(language: Option<String>) {
    let Some(language) = language else {
        *translate::DICT.write().unwrap() = None;
        return;
    };
    std::thread::spawn(move || {
        let dict = translate::Dictionary::load(&language);
        *translate::DICT.write().unwrap() = Some(Arc::new(dict));
    });
}

/// The running Path of Building: start it with `Pob.start` first.
#[component]
pub fn PobCanvas() -> impl IntoElement {
    match session() {
        Some(shared) => pob_view(shared).into_element(),
        None => view().into_element(),
    }
}

// ========
// POB view
// ========

fn rgba(c: [f32; 4]) -> Rgba {
    Rgba { r: c[0].clamp(0.0, 1.0), g: c[1].clamp(0.0, 1.0), b: c[2].clamp(0.0, 1.0), a: c[3].clamp(0.0, 1.0) }
}

fn rect(x: f32, y: f32, w: f32, h: f32) -> Bounds<Points> {
    bounds(point(px(x), px(y)), size(px(w), px(h)))
}

fn src_rect(s: [f32; 4]) -> Bounds<ScaledPixels> {
    Bounds {
        origin: Point { x: ScaledPixels(s[0]), y: ScaledPixels(s[1]) },
        size: Size { width: ScaledPixels(s[2]), height: ScaledPixels(s[3]) },
    }
}

/// Records POB's frame as a canvas drawing.
fn paint(frame: &Frame) -> Painter {
    let mut p = Painter::new()
        .fill_color(rgba(frame.clear))
        .fill_rect(0.0, 0.0, frame.width, frame.height)
        .text_baseline(CanvasTextBaseline::Alphabetic);
    // Every image drawn so far, first and out of sight: the canvas keeps
    // only the images a drawing names, and finds them early in the list.
    for uri in frame.images.iter() {
        p = p.draw_image(uri, rect(-8.0, -8.0, 1.0, 1.0));
    }
    let mut viewport: Option<[f32; 4]> = None;
    let mut alpha = 1.0f32;
    let mut font: Option<&str> = None;
    for item in &frame.items {
        if viewport != Some(item.viewport) {
            if viewport.is_some() {
                p = p.restore();
                font = None;
                alpha = 1.0;
            }
            let [x, y, w, h] = item.viewport;
            p = p.save().begin_path().rect(rect(x, y, w, h)).clip().translate(x, y);
            viewport = Some(item.viewport);
        }
        let mut set_alpha = |p: Painter, a: f32| {
            if (a - alpha).abs() > f32::EPSILON {
                alpha = a;
                p.global_alpha(a)
            } else {
                p
            }
        };
        p = match &item.cmd {
            Cmd::Rect { rect: r, color } => {
                let p = set_alpha(p, 1.0);
                p.fill_color(rgba(*color)).fill_rect(r[0], r[1], r[2], r[3])
            }
            Cmd::Poly { pts, color } => {
                let p = set_alpha(p, 1.0);
                p.fill_color(rgba(*color))
                    .begin_path()
                    .move_to(pts[0], pts[1])
                    .line_to(pts[2], pts[3])
                    .line_to(pts[4], pts[5])
                    .line_to(pts[6], pts[7])
                    .close_path()
                    .fill()
            }
            Cmd::Image { uri, src, dst, alpha: a } => {
                let p = set_alpha(p, *a);
                p.draw_image_part(uri, Some(src_rect(*src)), rect(dst[0], dst[1], dst[2], dst[3]))
            }
            Cmd::ImageAffine { uri, src, dst, m, clip, alpha: a } => {
                let p = set_alpha(p, *a);
                p.save()
                    .begin_path()
                    .move_to(clip[0], clip[1])
                    .line_to(clip[2], clip[3])
                    .line_to(clip[4], clip[5])
                    .line_to(clip[6], clip[7])
                    .close_path()
                    .clip()
                    .transform(*m)
                    .draw_image_part(uri, Some(src_rect(*src)), rect(dst[0], dst[1], dst[2], dst[3]))
                    .restore()
            }
            Cmd::Text { x, y, baseline, font: f, text, color } => {
                let mut p = set_alpha(p, 1.0);
                if font != Some(f.as_ref()) {
                    p = p.font(f);
                    font = Some(f.as_ref());
                }
                p.fill_color(rgba(*color)).fill_text(text, *x, *y + *baseline)
            }
        };
    }
    if viewport.is_some() {
        p = p.restore();
    }
    p
}

/// POB's name for a key the platform reports, if POB has one.
fn key_name(key: &str) -> Option<String> {
    let named = match key {
        "Backspace" => "BACK",
        "Tab" => "TAB",
        "Enter" => "RETURN",
        "Escape" => "ESCAPE",
        "Shift" => "SHIFT",
        "Control" => "CTRL",
        "Alt" => "ALT",
        "Pause" => "PAUSE",
        "PageUp" => "PAGEUP",
        "PageDown" => "PAGEDOWN",
        "End" => "END",
        "Home" => "HOME",
        "PrintScreen" => "PRINTSCREEN",
        "Insert" => "INSERT",
        "Delete" => "DELETE",
        "ArrowUp" => "UP",
        "ArrowDown" => "DOWN",
        "ArrowLeft" => "LEFT",
        "ArrowRight" => "RIGHT",
        "NumLock" => "NUMLOCK",
        "ScrollLock" => "SCROLLLOCK",
        k if k.len() >= 2 && k.len() <= 3 && k.starts_with('F') && k[1..].parse::<u8>().is_ok_and(|n| (1..=15).contains(&n)) => {
            return Some(k.to_string());
        }
        k => {
            let mut chars = k.chars();
            let c = chars.next()?;
            if chars.next().is_some() || !c.is_ascii() {
                return None;
            }
            return Some(c.to_ascii_lowercase().to_string());
        }
    };
    Some(named.to_string())
}

fn sync_modifiers(shared: &Shared, m: &Modifiers) {
    shared.set_key("SHIFT", m.shift);
    shared.set_key("CTRL", m.ctrl);
    shared.set_key("ALT", m.alt);
}

fn pob_view(shared: Arc<Shared>) -> impl IntoElement {
    let frame = signal(Arc::new(Frame::default()));
    let error = signal(None::<String>);
    let title = signal(String::new());
    {
        let shared = shared.clone();
        let seen = std::cell::Cell::new(0u64);
        set_interval(Duration::from_millis(8), move || {
            let generation = shared.generation.load(Ordering::SeqCst);
            if generation != seen.get() {
                seen.set(generation);
                frame.set(shared.frame.lock().unwrap().clone());
                let e = shared.error.lock().unwrap().clone();
                if e != error.get_untracked() {
                    error.set(e);
                }
            }
            let t = shared.title.lock().unwrap().clone();
            if t != title.get_untracked() {
                let mut a = WindowAttributes::default();
                a.title = Some(format!("{t} - pobt"));
                current_window().set(a);
                title.set(t);
            }
            // POB quitting ends POBT, unless it quits to go back to the launcher.
            if shared.exited.load(Ordering::SeqCst) && !shared.to_launcher.load(Ordering::SeqCst) {
                std::process::exit(0);
            }
        });
    }

    let s = shared.clone();
    let on_layout = move |b: &Bounds<Points>| {
        *s.screen.lock().unwrap() = (b.size.width.0, b.size.height.0);
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_move = move |e: &MouseEvent| {
        *s.cursor.lock().unwrap() = (e.position.x.0, e.position.y.0);
        sync_modifiers(&s, &e.modifiers);
        *s.last_input.lock().unwrap() = std::time::Instant::now();
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    // The left button through the responder system, so a drag keeps
    // reporting where the pointer is (POB pans the tree from it).
    let last_click = std::cell::Cell::new((f64::MIN, 0.0f32, 0.0f32));
    let on_down = move |e: &ResponderEvent| {
        let (x, y) = (e.location.x.0, e.location.y.0);
        let (t, lx, ly) = last_click.get();
        let double = e.timestamp - t < 450.0 && (x - lx).abs() < 5.0 && (y - ly).abs() < 5.0;
        last_click.set(if double { (f64::MIN, 0.0, 0.0) } else { (e.timestamp, x, y) });
        *s.cursor.lock().unwrap() = (x, y);
        sync_modifiers(&s, &e.modifiers);
        s.set_key("LEFTBUTTON", true);
        s.send(Input::KeyDown("LEFTBUTTON".into(), double));
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_drag = move |e: &ResponderEvent| {
        *s.cursor.lock().unwrap() = (e.location.x.0, e.location.y.0);
        *s.last_input.lock().unwrap() = std::time::Instant::now();
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_up = move |e: &ResponderEvent| {
        *s.cursor.lock().unwrap() = (e.location.x.0, e.location.y.0);
        if s.keys.lock().unwrap().contains("LEFTBUTTON") {
            s.set_key("LEFTBUTTON", false);
            s.send(Input::KeyUp("LEFTBUTTON".into()));
            s.poke.store(true, Ordering::SeqCst);
        }
    };
    let s = shared.clone();
    let on_context = move |e: &ContextMenuEvent| {
        *s.cursor.lock().unwrap() = (e.position.x.0, e.position.y.0);
        s.set_key("RIGHTBUTTON", true);
        s.send(Input::KeyDown("RIGHTBUTTON".into(), false));
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_mouse_up = move |e: &MouseEvent| {
        let name = match e.button {
            Some(MouseButton::Right) => "RIGHTBUTTON",
            Some(MouseButton::Middle) => "MIDDLEBUTTON",
            _ => return,
        };
        s.set_key(name, false);
        s.send(Input::KeyUp(name.into()));
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_wheel = move |e: &WheelEvent| {
        let dy = match e.delta {
            WheelDelta::Lines(p) => p.y,
            WheelDelta::Points(p) => p.y.0 / 40.0,
        };
        if dy == 0.0 {
            return;
        }
        *s.cursor.lock().unwrap() = (e.position.x.0, e.position.y.0);
        sync_modifiers(&s, &e.modifiers);
        let name = if dy > 0.0 { "WHEELUP" } else { "WHEELDOWN" };
        for _ in 0..(dy.abs().round().max(1.0) as usize).min(5) {
            s.send(Input::KeyDown(name.into(), false));
            s.send(Input::KeyUp(name.into()));
        }
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_key_down = move |e: &KeyEvent| {
        sync_modifiers(&s, &e.modifiers);
        // Ctrl+Shift+T switches the translation on and off.
        if e.modifiers.ctrl && e.modifiers.shift && e.key.eq_ignore_ascii_case("t") {
            let on = !s.translate.load(Ordering::SeqCst);
            s.translate.store(on, Ordering::SeqCst);
            s.poke.store(true, Ordering::SeqCst);
            return;
        }
        if let Some(name) = key_name(&e.key) {
            s.set_key(&name, true);
            s.send(Input::KeyDown(name, false));
        }
        let mut chars = e.key.chars();
        if let (Some(c), None) = (chars.next(), chars.next()) {
            if !e.modifiers.ctrl && !e.modifiers.alt && !c.is_control() {
                s.send(Input::Char(c.to_string()));
            }
        }
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_key_up = move |e: &KeyEvent| {
        sync_modifiers(&s, &e.modifiers);
        if let Some(name) = key_name(&e.key) {
            s.set_key(&name, false);
            s.send(Input::KeyUp(name));
        }
        s.poke.store(true, Ordering::SeqCst);
    };

    view()
        .flex_1()
        .child(
            canvas(move || frame.with(|f| paint(f)))
                .flex_1()
                .focusable(true)
                .capture_keys(KeyCapture::All)
                .on_layout(on_layout)
                .on_mouse_move(on_move)
                .claim_touches(TouchClaim::on_start())
                .keep_touches(true)
                .on_responder_grant(on_down)
                .on_responder_move(on_drag)
                .on_responder_release(on_up)
                .on_context_menu(on_context)
                .on_mouse_up(on_mouse_up)
                .on_wheel(on_wheel)
                .on_key_down(on_key_down)
                .on_key_up(on_key_up),
        )
        .child(dynamic(move || {
            error.get().map(|e| {
                view()
                    .absolute()
                    .left(px(8.0))
                    .bottom(px(8.0))
                    .max_w(px(900.0))
                    .p_3()
                    .rounded(px(6.0))
                    .bg(rgb(0x450a0a))
                    .child(text(e).text_size(px(12.0)).text_color(rgb(0xfecaca)))
            })
        }))
}
