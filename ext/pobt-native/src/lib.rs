//! pobt: Path of Building with its interface translated, hosted in a
//! Native Shell window. POB's Lua runs on its own thread (`host`); the
//! `PobCanvas` component draws its frames and sends it the mouse and keys.
//! The rest of the UI is `App.tsx`, over the `Pob` module.

pub mod dds;
pub mod frame;
pub mod host;
pub mod images;
pub mod install;
pub mod loading;
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
    element::input,
    keymap::{Modifiers, When},
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

/// The steps the running POB took to load last time, if it has loaded before.
static EXPECTED_STEPS: Mutex<Option<u32>> = Mutex::new(None);

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

/// The `number` of a POB manifest's `<Version …/>`, whichever of its
/// attributes comes first (an install's has `branch` before it).
fn manifest_version(xml: &str) -> Option<&str> {
    let (_, tag) = xml.split_once("<Version ")?;
    let tag = &tag[..tag.find('>')?];
    let (_, rest) = tag.split_once("number=\"")?;
    Some(&rest[..rest.find('"')?])
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
        // A runtime update POB left for its `Update.exe` goes in before its DLLs load; in a POBT that loaded them
        // already, in a new one.
        if install::pending_runtime_update(std::path::Path::new(&dir)).is_some() {
            if lua::loaded_from().is_some() {
                relaunch();
            }
            if let Err(e) = install::apply_runtime_update(std::path::Path::new(&dir)) {
                return format!("updating Path of Building: {e}");
            }
        }
        if lua::loaded_from().is_some_and(|d| d != std::path::Path::new(&dir)) {
            relaunch();
        }
        load_dictionary((!language.is_empty()).then_some(language));
        *EXPECTED_STEPS.lock().unwrap() = loading::expected(std::path::Path::new(&dir));
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

    /// The version of the Path of Building in `dir`, from its manifest.xml
    /// (`<Version number="2.63.0" />`); empty if it has none.
    pub fn pob_version(dir: String) -> String {
        let xml = std::fs::read_to_string(std::path::Path::new(&dir).join("manifest.xml")).unwrap_or_default();
        manifest_version(&xml).unwrap_or_default().to_string()
    }

    /// Opens `dir` in Explorer, off the UI thread as `open_url`.
    pub fn open_dir(dir: String) {
        std::thread::spawn(move || {
            if let Err(e) = std::process::Command::new("explorer").arg(&dir).spawn() {
                log::warn!("opening {dir}: {e}");
            }
        });
    }

    /// Installs a game's Path of Building ("poe1" or "poe2") from its latest
    /// release beside POBT.exe, in the background; false while one installs.
    pub fn install(game: String) -> bool {
        install::start(game_of(&game))
    }

    /// The install running or last run, as JSON: `{ game, phase, done, total,
    /// message }` (`phase`: "downloading", "unpacking", "done", "failed"); "" for
    /// none. Once done, the game's folder is saved in the settings.
    pub fn install_progress() -> String {
        let Some(p) = install::progress() else { return String::new() };
        if p.phase == "done" {
            let mut s = Settings::load();
            let dir = Some(PathBuf::from(&p.message));
            match p.game.as_str() {
                "Poe2" => s.poe2_dir = dir,
                _ => s.poe1_dir = dir,
            }
            s.save();
        }
        serde_json::to_string(&p).unwrap_or_default()
    }

    /// How far the POB that `start` started has loaded, as JSON: `{ loaded,
    /// steps, expected, message }`; `expected` is null the first time a POB
    /// loads, and `message` what it last said, translated.
    pub fn load_progress() -> String {
        let Some(s) = session() else {
            return r#"{"loaded":true,"steps":0,"expected":null,"message":""}"#.into();
        };
        let l = s.loading.lock().unwrap().clone();
        let message = translate::current()
            .and_then(|d| d.translate(&l.message))
            .unwrap_or(l.message);
        serde_json::json!({
            "loaded": s.loaded.load(Ordering::SeqCst),
            "steps": l.steps,
            "expected": *EXPECTED_STEPS.lock().unwrap(),
            "message": message,
        })
        .to_string()
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
    // Text starts on whole device pixels: its stems then land on pixels, not across two.
    let ratio = pixel_ratio().max(1.0);
    let snap = |v: f32| (v * ratio).round() / ratio;
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
                p.fill_color(rgba(*color)).fill_text(text, snap(*x), snap(*y + *baseline))
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
            // POB quitting ends POBT, unless it quits to go back to the launcher; or to update its runtime, which a new
            // POBT applies before it loads it.
            if shared.exited.load(Ordering::SeqCst) && !shared.to_launcher.load(Ordering::SeqCst) {
                if shared.runtime_update.load(Ordering::SeqCst) {
                    relaunch();
                }
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
        // nsh-core follows the DOM: positive y scrolls down.
        let name = if dy > 0.0 { "WHEELDOWN" } else { "WHEELUP" };
        for _ in 0..(dy.abs().round().max(1.0) as usize).min(5) {
            s.send(Input::KeyDown(name.into(), false));
            s.send(Input::KeyUp(name.into()));
        }
        s.poke.store(true, Ordering::SeqCst);
    };
    let s = shared.clone();
    let on_key_down = move |e: &KeyEvent| key_down(&s, e, frame.with_untracked(|f| f.text_input.is_none()));
    let s = shared.clone();
    let on_key_up = move |e: &KeyEvent| key_up(&s, e);

    // POB's focused edit box takes text from an input method through a native input over it (a sink, as NSH's
    // editor has): the canvas has no input method. The sink is there while a box has the focus, and takes it.
    let canvas_ref = element_ref();
    let sink_ref = element_ref();
    let composing = signal(String::new());
    let s = shared.clone();
    // Where the sink goes: POB's focused box, from its caret on.
    let at = move |i: usize| frame.with(|f| f.text_input.map_or(0.0, |r| r[i]));
    let sink = move || {
        // A focused native input gets no key events: its keys reach POB through bindings, which fire before the
        // input, and not while an input method composes (it keeps its keys).
        for &(keystroke, key, ctrl, shift) in SINK_KEYS {
            let s = s.clone();
            let options = KeyOptions { when: When::Always, repeat: true, for_focus: true, ..Default::default() };
            on_key_with(keystroke, options, move |_| {
                s.set_key("CTRL", ctrl);
                s.set_key("SHIFT", shift);
                s.send(Input::KeyDown(key.to_string(), false));
                s.send(Input::KeyUp(key.to_string()));
                s.poke.store(true, Ordering::SeqCst);
            });
        }
        let typed = s.clone();
        // What the sink holds, and its text held back while an input method composes: it reports the committed
        // text just before the composition ends. What changes in it is what was typed (deletions are the keys').
        let held = std::rc::Rc::new(std::cell::RefCell::new(String::new()));
        let pending = std::rc::Rc::new(std::cell::RefCell::new(None::<String>));
        let is_composing = std::rc::Rc::new(std::cell::Cell::new(false));
        // The sink's value, emptied after each change so its caret, which the input method's candidates follow,
        // stays at the start of POB's box. It follows what the platform reports, so emptying it is a change.
        let value = signal(String::new());
        let take = {
            let held = held.clone();
            move |text: &str| {
                let mut held = held.borrow_mut();
                for c in inserted(&held, text).chars().filter(|c| !c.is_control()) {
                    typed.send(Input::Char(c.to_string()));
                }
                *held = text.to_owned();
                typed.poke.store(true, Ordering::SeqCst);
                value.set(text.to_owned());
                if !text.is_empty() {
                    set_timeout(Duration::ZERO, move || value.set(String::new()));
                }
            }
        };
        let (take_now, pending_now, composing_now) = (take.clone(), pending.clone(), is_composing.clone());
        input()
            .element_ref(&sink_ref)
            .absolute()
            .left(move || Length::from(px(at(0))))
            .top(move || Length::from(px(at(1))))
            .w(move || Length::from(px(at(2))))
            .h(move || Length::from(px(at(3))))
            .p_0()
            .border(px(0.0))
            .opacity(0.02)
            .pointer_events(PointerEvents::None)
            .caret(false)
            .value(move || value.get())
            .auto_focus(true)
            .auto_correct(false)
            .auto_capitalize(AutoCapitalize::None)
            // POB pastes with Ctrl+V itself.
            .paste_behavior(PasteBehavior::Report)
            .on_composition_change(move |c: &Composition| {
                is_composing.set(c.composing);
                composing.set(c.text.clone());
                if !c.composing {
                    if let Some(text) = pending.borrow_mut().take() {
                        take(&text);
                    }
                }
            })
            .on_change(move |text: &str| {
                if composing_now.get() {
                    *pending_now.borrow_mut() = Some(text.to_owned());
                } else {
                    take_now(text);
                }
            })
    };
    // Back to the canvas once no box has the focus; back to the sink after a click while one has.
    // Whether a box has the focus, changed only when it does: the sink lives while it has.
    let editing = signal(false);
    effect(move || {
        let now = frame.with(|f| f.text_input.is_some());
        if editing.get_untracked() != now {
            editing.set(now);
            if !now {
                composing.set(String::new());
                canvas_ref.focus();
            }
        }
    });
    let on_mouse_up = {
        let up = on_mouse_up;
        move |e: &MouseEvent| {
            up(e);
            if frame.with_untracked(|f| f.text_input.is_some()) {
                sink_ref.focus();
            }
        }
    };

    view()
        .flex_1()
        .child(
            canvas(move || frame.with(|f| paint(f)))
                .element_ref(&canvas_ref)
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
        .child(dynamic(move || editing.get().then(|| sink())))
        // What the input method composes, at the end of the box, as POB cannot show it.
        .child(dynamic(move || {
            let text_ = composing.get();
            let rect = frame.with_untracked(|f| f.text_input)?;
            (!text_.is_empty()).then(|| {
                view()
                    .absolute()
                    .left(px(rect[0]))
                    .top(px(rect[1]))
                    .w(px(rect[2]))
                    .h(px(rect[3]))
                    .flex_row()
                    .justify_end()
                    .pointer_events(PointerEvents::None)
                    .child(
                        view()
                            .h_full()
                            .px_2()
                            .justify_center()
                            .bg(rgb(0x000000))
                            .border(px(1.0))
                            .border_color(rgb(0xb18d4e))
                            .child(text(text_).text_size(px(14.0)).text_color(rgb(0xffffff))),
                    )
            })
        }))
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

/// The keys POB's edit boxes use, bound while the input method's sink has
/// the focus: the keystroke, POB's key, and whether Ctrl and Shift are down.
const SINK_KEYS: &[(&str, &str, bool, bool)] = &[
    ("backspace", "BACK", false, false),
    ("delete", "DELETE", false, false),
    ("enter", "RETURN", false, false),
    ("escape", "ESCAPE", false, false),
    ("tab", "TAB", false, false),
    ("shift+tab", "TAB", false, true),
    ("left", "LEFT", false, false),
    ("right", "RIGHT", false, false),
    ("up", "UP", false, false),
    ("down", "DOWN", false, false),
    ("home", "HOME", false, false),
    ("end", "END", false, false),
    ("pageup", "PAGEUP", false, false),
    ("pagedown", "PAGEDOWN", false, false),
    ("shift+left", "LEFT", false, true),
    ("shift+right", "RIGHT", false, true),
    ("shift+home", "HOME", false, true),
    ("shift+end", "END", false, true),
    ("mod+left", "LEFT", true, false),
    ("mod+right", "RIGHT", true, false),
    ("mod+backspace", "BACK", true, false),
    ("mod+a", "a", true, false),
    ("mod+c", "c", true, false),
    ("mod+v", "v", true, false),
    ("mod+x", "x", true, false),
    ("mod+z", "z", true, false),
    ("mod+y", "y", true, false),
];

/// A key pressed on the canvas; `chars` sends the character it types too
/// (not while an edit box has the focus: the sink types them).
fn key_down(s: &Shared, e: &KeyEvent, chars: bool) {
    sync_modifiers(s, &e.modifiers);
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
    let mut cs = e.key.chars();
    if let (true, Some(c), None) = (chars, cs.next(), cs.next()) {
        if !e.modifiers.ctrl && !e.modifiers.alt && !c.is_control() {
            s.send(Input::Char(c.to_string()));
        }
    }
    s.poke.store(true, Ordering::SeqCst);
}

fn key_up(s: &Shared, e: &KeyEvent) {
    sync_modifiers(s, &e.modifiers);
    if let Some(name) = key_name(&e.key) {
        s.set_key(&name, false);
        s.send(Input::KeyUp(name));
    }
    s.poke.store(true, Ordering::SeqCst);
}

/// What `now` has that `before` had not, between their common start and end.
fn inserted<'a>(before: &str, now: &'a str) -> &'a str {
    let start = before.char_indices().zip(now.chars()).take_while(|((_, a), b)| a == b).last().map_or(0, |((i, a), _)| i + a.len_utf8());
    let (b, n) = (&before[start..], &now[start..]);
    let end = b.chars().rev().zip(n.chars().rev()).take_while(|(a, b)| a == b).map(|(c, _)| c.len_utf8()).sum::<usize>();
    &n[..n.len() - end.min(n.len())]
}

#[cfg(test)]
mod tests {
    use super::{inserted, manifest_version};

    #[test]
    fn sink_insertions() {
        assert_eq!(inserted("", "a"), "a");
        assert_eq!(inserted("ab", "abc"), "c");
        assert_eq!(inserted("abc", "abxc"), "x");
        assert_eq!(inserted("ab", "ab腾讯"), "腾讯");
        assert_eq!(inserted("abc", "ab"), "");
        assert_eq!(inserted("aa", "aaa"), "a");
    }

    #[test]
    fn manifest_versions() {
        assert_eq!(manifest_version("<PoBVersion>\n\t<Version number=\"2.63.0\" />"), Some("2.63.0"));
        assert_eq!(manifest_version("<Version branch=\"master\" number=\"2.68.1\" platform=\"win32\"/>"), Some("2.68.1"));
        assert_eq!(manifest_version("<Version branch=\"master\"/><Source number=\"1\"/>"), None);
        assert_eq!(manifest_version(""), None);
    }
}
