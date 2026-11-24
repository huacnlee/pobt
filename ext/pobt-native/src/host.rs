//! Runs Path of Building's Lua on its own thread, standing in for
//! SimpleGraphic: the natives POB calls, its callbacks, sub scripts, and the
//! frames it draws, which the UI thread picks up from [`Shared`].

use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

use crate::{
    frame::{Cmd, Frame, Item},
    images,
    lua::{self, LUA_TNUMBER, LUA_TSTRING, LUA_TTABLE, Lua, Value},
    native,
    text::{self, Align, Color, FontKind},
    translate,
};

/// What the UI sends the Lua thread.
#[derive(Debug, Clone)]
pub enum Input {
    KeyDown(String, bool),
    KeyUp(String),
    Char(String),
}

/// State shared between the UI thread and the Lua thread.
/// POB loading: the modules it has loaded so far, and the last thing it said.
#[derive(Debug, Clone, Default)]
pub struct Loading {
    pub steps: u32,
    pub message: String,
}

pub struct Shared {
    pub frame: Mutex<Arc<Frame>>,
    pub generation: AtomicU64,
    pub screen: Mutex<(f32, f32)>,
    pub cursor: Mutex<(f32, f32)>,
    pub keys: Mutex<HashSet<String>>,
    pub input: Mutex<Option<mpsc::Sender<Input>>>,
    pub title: Mutex<String>,
    /// The last error POB raised outside its own handlers.
    pub error: Mutex<Option<String>>,
    pub translate: AtomicBool,
    pub exited: AtomicBool,
    /// The UI asks POB to quit (back to the launcher): it does if its
    /// `CanExit` agrees, or asks about unsaved changes first.
    pub quit: AtomicBool,
    /// POB quits to go back to the launcher, not to end POBT.
    pub to_launcher: AtomicBool,
    /// POB asked its `Update.exe` to replace its runtime: POBT does instead.
    pub runtime_update: AtomicBool,
    /// How far POB has loaded, until it has (`loaded`).
    pub loading: Mutex<Loading>,
    pub loaded: AtomicBool,
    /// Set by the UI to have the Lua thread repaint and process input now.
    pub poke: AtomicBool,
    pub last_input: Mutex<Instant>,
}

impl Shared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            frame: Mutex::new(Arc::new(Frame::default())),
            generation: AtomicU64::new(0),
            screen: Mutex::new((1280.0, 800.0)),
            cursor: Mutex::new((-1.0, -1.0)),
            keys: Mutex::new(HashSet::new()),
            input: Mutex::new(None),
            title: Mutex::new("Path of Building".into()),
            error: Mutex::new(None),
            translate: AtomicBool::new(true),
            exited: AtomicBool::new(false),
            quit: AtomicBool::new(false),
            to_launcher: AtomicBool::new(false),
            runtime_update: AtomicBool::new(false),
            loading: Mutex::new(Loading::default()),
            loaded: AtomicBool::new(false),
            poke: AtomicBool::new(false),
            last_input: Mutex::new(Instant::now()),
        })
    }

    pub fn send(&self, input: Input) {
        *self.last_input.lock().unwrap() = Instant::now();
        if let Some(tx) = self.input.lock().unwrap().as_ref() {
            let _ = tx.send(input);
        }
    }

    pub fn set_key(&self, name: &str, down: bool) {
        let key = normalize_key(name);
        let mut keys = self.keys.lock().unwrap();
        if down {
            keys.insert(key);
        } else {
            keys.remove(&key);
        }
    }
}

fn normalize_key(name: &str) -> String {
    if name.chars().count() > 1 { name.to_ascii_uppercase() } else { name.to_ascii_lowercase() }
}

const PRELUDE: &str = include_str!("prelude.lua");
const CALLBACK_INIT: &str = "OnInit";

pub mod service;

struct Sub {
    rx: mpsc::Receiver<SubMsg>,
    running: bool,
}

enum SubMsg {
    Sub(String, Vec<Value>),
    Func(String, Vec<Value>, mpsc::Sender<Vec<Value>>),
    Done(Result<Vec<Value>, String>),
}

struct Host {
    shared: Arc<Shared>,
    pob_dir: PathBuf,
    user_dir: Option<PathBuf>,
    start: Instant,
    items: Vec<((i32, i32), u32, Item)>,
    seq: u32,
    layer: (i32, i32),
    viewport: [f32; 4],
    color: Color,
    clear: Color,
    screen: (f32, f32),
    raw_text: bool,
    /// The focused edit box this frame drew (`SetTextInput`).
    text_input: Option<[f32; 4]>,
    tr: translate::Cache,
    subs: HashMap<u32, Sub>,
    next_sub: u32,
    restart: bool,
    /// Images the canvas was given before: a frame brings in only so many
    /// new ones, as the canvas loads a bounded number at once.
    introduced: HashSet<Arc<str>>,
    introduced_order: Vec<Arc<str>>,
    /// `introduced_order` as the frames share it.
    images: Arc<[Arc<str>]>,
}

thread_local! {
    static HOST: RefCell<Option<Host>> = const { RefCell::new(None) };
    static SUB: RefCell<Option<mpsc::Sender<SubMsg>>> = const { RefCell::new(None) };
}

fn with_host<R>(f: impl FnOnce(&mut Host) -> R) -> Option<R> {
    HOST.with(|h| h.borrow_mut().as_mut().map(f))
}

/// Starts POB from `pob_dir` on a new thread, which ends when POB quits.
pub fn start(pob_dir: PathBuf, shared: Arc<Shared>) -> Result<std::thread::JoinHandle<()>, String> {
    lua::init(&pob_dir)?;
    set_dll_directory(&pob_dir);
    std::env::set_current_dir(&pob_dir).map_err(|e| format!("{}: {e}", pob_dir.display()))?;
    std::thread::Builder::new()
        .name("pobt-lua".into())
        .stack_size(64 << 20)
        .spawn(move || run(pob_dir, shared))
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn set_dll_directory(dir: &Path) {
    use std::os::windows::ffi::OsStrExt;
    unsafe extern "system" {
        fn SetDllDirectoryW(path: *const u16) -> i32;
    }
    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe { SetDllDirectoryW(wide.as_ptr()) };
}

#[cfg(not(windows))]
fn set_dll_directory(_dir: &Path) {}

fn run(pob_dir: PathBuf, shared: Arc<Shared>) {
    loop {
        let (tx, rx) = mpsc::channel();
        *shared.input.lock().unwrap() = Some(tx);
        let restart = run_once(&pob_dir, &shared, rx);
        if !restart {
            break;
        }
        log::info!("restarting POB");
    }
    shared.exited.store(true, Ordering::SeqCst);
}

fn report(shared: &Shared, what: &str, err: String) {
    log::error!("{what}: {err}");
    *shared.error.lock().unwrap() = Some(format!("{what}:\n{err}"));
    shared.generation.fetch_add(1, Ordering::SeqCst);
}

/// One life of the Lua state; true when POB asked to restart.
fn run_once(pob_dir: &Path, shared: &Arc<Shared>, rx: mpsc::Receiver<Input>) -> bool {
    let Some(l) = Lua::new() else {
        report(shared, "Lua", "cannot create a Lua state".into());
        return false;
    };
    enter(l, pob_dir, shared);
    let boot = l.load(PRELUDE.as_bytes(), "pobt/prelude.lua").and_then(|_| l.pcall(0, 0));
    let boot = boot.and_then(|_| match demo() {
        // The demo of edit boxes in place of POB, in a development run.
        true => l.load(DEMO.as_bytes(), "pobt/demo.lua").and_then(|_| l.pcall(0, 0)),
        false => launch(l, pob_dir),
    });
    if let Err(e) = boot {
        report(shared, "Error loading Launch.lua", e);
        idle_until_input(shared, &rx);
        l.close();
        return false;
    }
    l.get_global("__pobt_hookLaunch");
    let _ = l.pcall(0, 0);
    if let Err(e) = callback(l, "OnInit", &[]) {
        report(shared, "Error in OnInit", e);
    }
    if !shared.loaded.load(Ordering::SeqCst) && !demo() {
        let steps = shared.loading.lock().unwrap().steps;
        crate::loading::remember(pob_dir, steps);
    }

    let mut frames = 0u64;
    loop {
        let begin = Instant::now();
        // Input.
        while let Ok(input) = rx.try_recv() {
            dispatch(l, shared, &input);
        }
        if shared.quit.load(Ordering::SeqCst) {
            // POB says no while there are unsaved changes, and asks about them itself.
            let can = callback(l, "CanExit", &[]);
            if !matches!(can.as_deref(), Ok([Value::Bool(false), ..])) {
                shared.exited.store(true, Ordering::SeqCst);
            }
            shared.quit.store(false, Ordering::SeqCst);
        }
        if with_host(|h| h.restart).unwrap_or(false) || shared.exited.load(Ordering::SeqCst) {
            break;
        }

        run_subscripts(l);

        frame(l, shared);
        // Loaded once its first frame is out: the launcher's loading screen gives way to it.
        shared.loaded.store(true, Ordering::SeqCst);
        frames += 1;
        if frames % 120 == 0 {
            translate::dump_misses();
        }
        if frames % 600 == 0 {
            l.get_global("collectgarbage");
            l.push_str("step");
            let _ = l.pcall(1, 0);
        }

        // Pace: ~60 fps while the user is active or work is running, slower
        // when idle, waking early for input.
        let busy = with_host(|h| !h.subs.is_empty()).unwrap_or(false)
            || shared.last_input.lock().unwrap().elapsed() < Duration::from_secs(3);
        let target = if busy { Duration::from_millis(16) } else { Duration::from_millis(100) };
        let deadline = begin + target;
        while Instant::now() < deadline {
            if shared.poke.swap(false, Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(4));
        }
    }

    let restart = with_host(|h| h.restart).unwrap_or(false);
    let _ = callback(l, "OnExit", &[]);
    HOST.with(|h| *h.borrow_mut() = None);
    l.close();
    restart
}

/// Makes this thread the host of the Lua state `l`, with its natives in `__sg`.
fn enter(l: Lua, pob_dir: &Path, shared: &Arc<Shared>) {
    HOST.with(|h| {
        *h.borrow_mut() = Some(Host {
            shared: shared.clone(),
            pob_dir: pob_dir.to_path_buf(),
            user_dir: dirs::document_dir(),
            start: Instant::now(),
            items: Vec::new(),
            seq: 0,
            layer: (0, 0),
            viewport: [0.0, 0.0, 0.0, 0.0],
            color: [1.0; 4],
            clear: [0.0, 0.0, 0.0, 1.0],
            screen: *shared.screen.lock().unwrap(),
            raw_text: false,
            text_input: None,
            tr: translate::Cache::new(),
            subs: HashMap::new(),
            next_sub: 1,
            restart: false,
            introduced: HashSet::new(),
            introduced_order: Vec::new(),
            images: Arc::from(Vec::<Arc<str>>::new()),
        })
    });
    register(l);
}

/// Runs POB's `Launch.lua`.
fn launch(l: Lua, pob_dir: &Path) -> Result<(), String> {
    let code = std::fs::read(pob_dir.join("Launch.lua")).map_err(|e| format!("Launch.lua: {e}"))?;
    // Its "#@ SimpleGraphic" first line is not Lua: `load` skips it.
    l.load(&code, "Launch.lua")?;
    l.pcall(0, 0)
}

const EXPORT: &str = include_str!("export.lua");

/// A character made a build by POB's own import.
pub struct Exported {
    /// The build code, as POB's Import/Export tab gives it.
    pub code: String,
    /// The build's XML, as POB saves it.
    pub xml: String,
    /// Where POB keeps its builds.
    pub build_path: String,
}

/// Has the POB in `pob_dir` import a character from the JSON an account's
/// site gives (`char`: its entry in the character list; `items`:
/// `get-items`; `passives`: `get-passive-skills`), and save the build. A POB
/// of its own, with no window, on a new thread: it loads as the launcher's
/// does, a few seconds; `step` hears how far it is. Not while POB runs.
pub fn export(
    pob_dir: PathBuf,
    name: String,
    char: String,
    items: String,
    passives: String,
    step: impl Fn(&str) + Send + 'static,
) -> Result<Exported, String> {
    lua::init(&pob_dir)?;
    set_dll_directory(&pob_dir);
    std::env::set_current_dir(&pob_dir).map_err(|e| format!("{}: {e}", pob_dir.display()))?;
    std::thread::Builder::new()
        .name("pobt-export".into())
        .stack_size(64 << 20)
        .spawn(move || {
            let shared = Shared::new();
            shared.translate.store(false, Ordering::SeqCst);
            let l = Lua::new().ok_or("cannot create a Lua state")?;
            enter(l, &pob_dir, &shared);
            let out = export_in(l, &pob_dir, &shared, &[name, char, items, passives], &step);
            HOST.with(|h| *h.borrow_mut() = None);
            l.close();
            out
        })
        .map_err(|e| e.to_string())?
        .join()
        .map_err(|_| "Path of Building stopped".to_string())?
}

fn export_in(l: Lua, pob_dir: &Path, shared: &Arc<Shared>, args: &[String; 4], step: &dyn Fn(&str)) -> Result<Exported, String> {
    let [name, char, items, passives] = args;
    let failed = |what: &str| shared.error.lock().unwrap().take().map(|e| format!("{what}: {e}"));
    step("loading");
    l.load(PRELUDE.as_bytes(), "pobt/prelude.lua").and_then(|_| l.pcall(0, 0))?;
    launch(l, pob_dir)?;
    l.get_global("__pobt_hookLaunch");
    let _ = l.pcall(0, 0);
    callback(l, "OnInit", &[])?;
    let run = |stage: &str, args: &[&String]| -> Result<Vec<Value>, String> {
        let base = l.top();
        l.load(EXPORT.as_bytes(), "pobt/export.lua")?;
        l.push_str(stage);
        for a in args {
            l.push_value_of(&Value::Str(a.as_bytes().to_vec()));
        }
        l.pcall(args.len() as i32 + 1, lua::LUA_MULTRET)?;
        let out = l.values_from(base + 1);
        l.set_top(base);
        Ok(out)
    };
    // A build opens in a frame.
    run("new", &[name])?;
    frame(l, shared);
    if let Some(e) = failed("opening a build") {
        return Err(e);
    }
    step("importing");
    run("import", &[char, items, passives])?;
    // Its calculations, which the build's XML holds, in the next frames.
    for _ in 0..2 {
        frame(l, shared);
    }
    if let Some(e) = failed("importing") {
        return Err(e);
    }
    let out = run("save", &[])?;
    let text = |i: usize| match out.get(i) {
        Some(Value::Str(s)) => String::from_utf8_lossy(s).into_owned(),
        _ => String::new(),
    };
    let code = text(0);
    if code.is_empty() {
        return Err("Path of Building made no build code".into());
    }
    Ok(Exported { code, xml: text(1), build_path: text(2) })
}

/// A few of POB's edit boxes on their own, to try typing in them by hand
/// (`POBT_DEMO=1 nsh run`, then play) and for the tests below.
const DEMO: &str = include_str!("demo.lua");

/// Whether to run the demo in place of POB: `POBT_DEMO` set in a development
/// build.
fn demo() -> bool {
    cfg!(debug_assertions) && std::env::var_os("POBT_DEMO").is_some()
}

/// Passes `input` to POB's callbacks.
fn dispatch(l: Lua, shared: &Shared, input: &Input) {
    let (name, args): (&str, Vec<Value>) = match input {
        Input::KeyDown(k, dbl) => ("OnKeyDown", vec![Value::Str(k.clone().into_bytes()), Value::Bool(*dbl)]),
        Input::KeyUp(k) => ("OnKeyUp", vec![Value::Str(k.clone().into_bytes()), Value::Bool(false)]),
        Input::Char(c) => ("OnChar", vec![Value::Str(c.clone().into_bytes()), Value::Bool(false)]),
    };
    if let Err(e) = callback(l, name, &args) {
        report(shared, &format!("Error in {name}"), e);
    }
}

/// Has POB draw a frame, and publishes it.
fn frame(l: Lua, shared: &Shared) {
    let screen = *shared.screen.lock().unwrap();
    with_host(|h| {
        h.items.clear();
        h.text_input = None;
        h.seq = 0;
        h.layer = (0, 0);
        h.screen = screen;
        h.viewport = [0.0, 0.0, screen.0, screen.1];
        h.color = [1.0; 4];
    });
    l.get_global("__pobt_hookClasses");
    let _ = l.pcall(0, 0);
    if let Err(e) = callback(l, "OnFrame", &[]) {
        report(shared, "Error in OnFrame", e);
    }
    publish(shared);
}

fn idle_until_input(shared: &Shared, rx: &mpsc::Receiver<Input>) {
    while !shared.exited.load(Ordering::SeqCst) {
        let _ = rx.recv_timeout(Duration::from_millis(200));
    }
}

/// Calls POB's callback `name` (or its main object's method).
fn callback(l: Lua, name: &str, args: &[Value]) -> Result<Vec<Value>, String> {
    let base = l.top();
    l.get_global("__pobt_call");
    l.push_str(name);
    for a in args {
        l.push_value_of(a);
    }
    l.pcall(args.len() as i32 + 1, lua::LUA_MULTRET)?;
    let out = l.values_from(base + 1);
    l.set_top(base);
    Ok(out)
}

fn publish(shared: &Shared) {
    let frame = with_host(|h| {
        let mut items = std::mem::take(&mut h.items);
        items.sort_by_key(|(layer, seq, _)| (*layer, *seq));
        // Bring in at most NEW_IMAGES images the canvas has not seen; the
        // rest wait for the next frames.
        const NEW_IMAGES: usize = 96;
        let mut fresh = 0;
        let introduced = &mut h.introduced;
        let order = &mut h.introduced_order;
        let items = items
            .into_iter()
            .map(|(_, _, i)| i)
            .filter(|i| {
                let uri = match &i.cmd {
                    Cmd::Image { uri, .. } | Cmd::ImageAffine { uri, .. } => uri,
                    _ => return true,
                };
                if introduced.contains(uri) {
                    return true;
                }
                if fresh < NEW_IMAGES {
                    fresh += 1;
                    introduced.insert(uri.clone());
                    order.push(uri.clone());
                    return true;
                }
                false
            })
            .collect();
        if fresh > 0 || h.images.len() != h.introduced_order.len() {
            h.images = Arc::from(h.introduced_order.as_slice());
        }
        Frame {
            width: h.screen.0,
            height: h.screen.1,
            clear: h.clear,
            items,
            images: h.images.clone(),
            text_input: h.text_input,
        }
    });
    let Some(frame) = frame else { return };
    let mut current = shared.frame.lock().unwrap();
    if **current != frame {
        *current = Arc::new(frame);
        shared.generation.fetch_add(1, Ordering::SeqCst);
    }
}

// ===========
// Sub scripts
// ===========

fn run_subscripts(l: Lua) {
    let ids: Vec<u32> = with_host(|h| h.subs.keys().copied().collect()).unwrap_or_default();
    for id in ids {
        loop {
            let msg = with_host(|h| h.subs.get(&id).and_then(|s| s.rx.try_recv().ok())).flatten();
            let Some(msg) = msg else { break };
            let id_value = || {
                // POB keys its sub scripts by the light userdata it got.
                Value::Num(id as f64)
            };
            match msg {
                SubMsg::Sub(name, args) => {
                    let mut a = vec![Value::Str(name.into_bytes())];
                    a.extend(args);
                    if let Err(e) = callback(l, "OnSubCall", &a) {
                        report(&shared(), "Error in OnSubCall", e);
                    }
                }
                SubMsg::Func(name, args, reply) => {
                    let mut a = vec![Value::Str(name.into_bytes())];
                    a.extend(args);
                    let out = callback(l, "OnSubCall", &a).unwrap_or_default();
                    let _ = reply.send(out);
                }
                SubMsg::Done(result) => {
                    with_host(|h| h.subs.remove(&id));
                    let _ = id_value;
                    let (name, args) = match result {
                        Ok(values) => ("OnSubFinished", values),
                        Err(e) => ("OnSubError", vec![Value::Str(e.into_bytes())]),
                    };
                    let base = l.top();
                    l.get_global("__pobt_call");
                    l.push_str(name);
                    l.push_light(id as usize as *mut _);
                    for a in &args {
                        l.push_value_of(a);
                    }
                    if let Err(e) = l.pcall(args.len() as i32 + 2, 0) {
                        report(&shared(), &format!("Error in {name}"), e);
                    }
                    l.set_top(base);
                    break;
                }
            }
        }
    }
}

fn shared() -> Arc<Shared> {
    with_host(|h| h.shared.clone()).expect("host")
}

fn launch_subscript(script: Vec<u8>, funcs: String, subs: String, args: Vec<Value>) -> Option<u32> {
    let (tx, rx) = mpsc::channel();
    let id = with_host(|h| {
        let id = h.next_sub;
        h.next_sub += 1;
        h.subs.insert(id, Sub { rx, running: true });
        id
    })?;
    std::thread::Builder::new()
        .name(format!("pobt-sub-{id}"))
        .stack_size(16 << 20)
        .spawn(move || {
            SUB.with(|s| *s.borrow_mut() = Some(tx.clone()));
            let result = (|| {
                let l = Lua::new().ok_or("cannot create a Lua state")?;
                l.get_global("os");
                l.register(-1, "exit", sub_os_exit);
                l.pop(1);
                l.get_global("package");
                l.get_field(-1, "path");
                let path = l.string(-1).unwrap_or_default();
                l.pop(1);
                l.push_str(&format!("{path};lua/?.lua;lua/?/init.lua"));
                l.set_field(-2, "path");
                l.pop(1);
                for (list, f) in [(&funcs, sub_func as lua::lua_CFunction), (&subs, sub_sub)] {
                    for name in list.split(',').map(str::trim).filter(|n| !n.is_empty()) {
                        l.push_str(name);
                        l.push_closure(f, 1);
                        l.set_global(name);
                    }
                }
                let base = l.top();
                l.load(&script, "subscript")?;
                for a in &args {
                    l.push_value_of(a);
                }
                let r = l.pcall(args.len() as i32, lua::LUA_MULTRET);
                let out = r.map(|_| l.values_from(base + 1));
                l.close();
                out
            })();
            let _ = tx.send(SubMsg::Done(result.map_err(|e: String| e)));
        })
        .ok()?;
    Some(id)
}

native!(sub_os_exit, |_l| { 0 });

native!(sub_func, |l| {
    let name = l.string(lua::upvalue_index(1)).unwrap_or_default();
    let args = l.values_from(1);
    let (rtx, rrx) = mpsc::channel();
    let sent = SUB.with(|s| s.borrow().as_ref().map(|tx| tx.send(SubMsg::Func(name, args, rtx)).is_ok()));
    if sent != Some(true) {
        return 0;
    }
    let out = rrx.recv().unwrap_or_default();
    for v in &out {
        l.push_value_of(v);
    }
    out.len() as i32
});

native!(sub_sub, |l| {
    let name = l.string(lua::upvalue_index(1)).unwrap_or_default();
    let args = l.values_from(1);
    SUB.with(|s| {
        if let Some(tx) = s.borrow().as_ref() {
            let _ = tx.send(SubMsg::Sub(name, args));
        }
    });
    0
});

// =======
// Natives
// =======

fn register(l: Lua) {
    l.new_table();
    let fns: &[(&str, lua::lua_CFunction)] = &[
        ("SetDrawLayer", n_set_draw_layer),
        ("GetDrawLayer", n_get_draw_layer),
        ("SetViewport", n_set_viewport),
        ("SetDrawColor", n_set_draw_color),
        ("GetDrawColor", n_get_draw_color),
        ("SetClearColor", n_set_clear_color),
        ("DrawImage", n_draw_image),
        ("DrawImageQuad", n_draw_image_quad),
        ("DrawString", n_draw_string),
        ("DrawStringWidth", n_draw_string_width),
        ("DrawStringCursorIndex", n_draw_string_cursor_index),
        ("StripEscapes", n_strip_escapes),
        ("SetRawText", n_set_raw_text),
        ("SetTextInput", n_set_text_input),
        ("Translate", n_translate),
        ("GetScreenSize", n_get_screen_size),
        ("GetCursorPos", n_get_cursor_pos),
        ("IsKeyDown", n_is_key_down),
        ("Copy", n_copy),
        ("Paste", n_paste),
        ("Deflate", n_deflate),
        ("Inflate", n_inflate),
        ("GetTime", n_get_time),
        ("Paths", n_paths),
        ("MakeDir", n_make_dir),
        ("RemoveDir", n_remove_dir),
        ("SetWindowTitle", n_set_window_title),
        ("OpenURL", n_open_url),
        ("SpawnProcess", n_spawn_process),
        ("Exit", n_exit),
        ("Restart", n_restart),
        ("Log", n_log),
        ("Step", n_step),
        ("ImgLoad", n_img_load),
        ("ImgUri", n_img_uri),
        ("ImgAtlas", n_img_atlas),
        ("ArtLoad", n_art_load),
        ("ArtRect", n_art_rect),
        ("ArtArc", n_art_arc),
        ("FileSearch", n_file_search),
        ("LaunchSubScript", n_launch_subscript),
        ("AbortSubScript", n_abort_subscript),
        ("IsSubScriptRunning", n_is_subscript_running),
    ];
    for (name, f) in fns {
        l.register(-1, name, *f);
    }
    l.set_global("__sg");
}

fn emit(h: &mut Host, cmd: Cmd) {
    h.seq += 1;
    h.items.push((h.layer, h.seq, Item { viewport: h.viewport, cmd }));
}

native!(n_set_draw_layer, |l| {
    with_host(|h| {
        let sub = if l.kind(2) == LUA_TNUMBER { l.int(2) as i32 } else { 0 };
        if l.kind(1) == LUA_TNUMBER {
            h.layer = (l.int(1) as i32, sub);
        } else {
            h.layer.1 = sub;
        }
    });
    0
});

native!(n_get_draw_layer, |l| {
    l.push_int(with_host(|h| h.layer.1 as i64).unwrap_or(0));
    1
});

native!(n_set_viewport, |l| {
    with_host(|h| {
        if l.top() >= 4 && l.num(4) != 0.0 {
            h.viewport = [l.num(1) as f32, l.num(2) as f32, l.num(3) as f32, l.num(4) as f32];
        } else {
            h.viewport = [0.0, 0.0, h.screen.0, h.screen.1];
        }
    });
    0
});

native!(n_set_draw_color, |l| {
    let color = if l.kind(1) == LUA_TSTRING {
        let b = l.bytes(1).unwrap_or_default();
        if text::escape_len(b) == 0 {
            return 0;
        }
        text::escape_color(b)
    } else {
        let a = if l.kind(4) == LUA_TNUMBER { l.num(4) as f32 } else { 1.0 };
        [l.num(1) as f32, l.num(2) as f32, l.num(3) as f32, a]
    };
    with_host(|h| h.color = color);
    0
});

native!(n_get_draw_color, |l| {
    let c = with_host(|h| h.color).unwrap_or([1.0; 4]);
    for v in c {
        l.push_num(v as f64);
    }
    4
});

native!(n_set_clear_color, |l| {
    let a = if l.kind(4) == LUA_TNUMBER { l.num(4) as f32 } else { 1.0 };
    let c = [l.num(1) as f32, l.num(2) as f32, l.num(3) as f32, a];
    with_host(|h| h.clear = c);
    0
});

fn arg_f32s(l: Lua, from: i32, n: usize) -> Vec<f32> {
    (0..n).map(|i| l.num(from + i as i32) as f32).collect()
}

/// The image argument of a draw call: its id, or none for a solid colour.
fn img_arg(l: Lua) -> Option<u32> {
    (l.kind(1) == LUA_TNUMBER).then(|| l.int(1) as u32)
}

native!(n_draw_image, |l| {
    let n = l.top();
    let img = img_arg(l);
    let xy = arg_f32s(l, 2, 4);
    let (uv, stack) = match n {
        9 | 10 => (arg_f32s(l, 6, 4), if n == 10 { l.int(10) } else { 1 }),
        6 => (vec![0.0, 0.0, 1.0, 1.0], l.int(6)),
        _ => (vec![0.0, 0.0, 1.0, 1.0], 1),
    };
    let layer = (stack.max(1) - 1) as u32;
    with_host(|h| {
        let color = h.color;
        let dst = [xy[0], xy[1], xy[2], xy[3]];
        match img {
            None => emit(h, Cmd::Rect { rect: dst, color }),
            Some(id) => draw_image(h, id, layer, dst, [uv[0], uv[1], uv[2], uv[3]], color),
        }
    });
    0
});

fn draw_image(h: &mut Host, id: u32, layer: u32, dst: [f32; 4], uv: [f32; 4], color: Color) {
    if color[3] <= 0.0 {
        return;
    }
    let Some((uri, w, hh)) = images::uri(id, layer, [color[0], color[1], color[2]]) else { return };
    let (w, hh) = (w as f32, hh as f32);
    if w == 0.0 || hh == 0.0 || dst[2] == 0.0 || dst[3] == 0.0 {
        return;
    }
    let [u1, v1, u2, v2] = uv;
    let eps = 1e-4;
    let inside = |a: f32, b: f32| a.min(b) >= -eps && a.max(b) <= 1.0 + eps;
    if u1 <= u2 && v1 <= v2 && inside(u1, u2) && inside(v1, v2) {
        let src = [u1.max(0.0) * w, v1.max(0.0) * hh, (u2 - u1).min(1.0) * w, (v2 - v1).min(1.0) * hh];
        emit(h, Cmd::Image { uri, src, dst, alpha: color[3] });
        return;
    }
    if u1 < u2 && v1 < v2 {
        // A repeating texture: one draw per tile.
        let (tu0, tu1) = (u1.floor() as i32, u2.ceil() as i32);
        let (tv0, tv1) = (v1.floor() as i32, v2.ceil() as i32);
        if ((tu1 - tu0) as i64) * ((tv1 - tv0) as i64) > 2000 {
            return;
        }
        let sx = dst[2] / (u2 - u1);
        let sy = dst[3] / (v2 - v1);
        for tv in tv0..tv1 {
            let (a, b) = ((tv as f32).max(v1), ((tv + 1) as f32).min(v2));
            if b <= a {
                continue;
            }
            for tu in tu0..tu1 {
                let (c, d) = ((tu as f32).max(u1), ((tu + 1) as f32).min(u2));
                if d <= c {
                    continue;
                }
                let src = [(c - tu as f32) * w, (a - tv as f32) * hh, (d - c) * w, (b - a) * hh];
                let rect = [dst[0] + (c - u1) * sx, dst[1] + (a - v1) * sy, (d - c) * sx, (b - a) * sy];
                emit(h, Cmd::Image { uri: uri.clone(), src, dst: rect, alpha: color[3] });
            }
        }
        return;
    }
    // Mirrored: map the image's pixels onto the rectangle.
    let p = [dst[0], dst[1], dst[0] + dst[2], dst[1], dst[0] + dst[2], dst[1] + dst[3], dst[0], dst[1] + dst[3]];
    let t = [u1, v1, u2, v1, u2, v2, u1, v2];
    quad_image(h, uri, w, hh, p, t, color[3]);
}

/// An image mapped onto a parallelogram through an affine transform from
/// its pixels: corners `p` (x, y pairs) take texture coordinates `t`.
fn quad_image(h: &mut Host, uri: Arc<str>, w: f32, hh: f32, p: [f32; 8], t: [f32; 8], alpha: f32) {
    // The affine map from the image's (unwrapped) pixels to the screen,
    // fixed by three corners.
    let px = |i: usize| (t[i * 2] * w, t[i * 2 + 1] * hh);
    let sc = |i: usize| (p[i * 2], p[i * 2 + 1]);
    let (p0, p1, p3) = (px(0), px(1), px(3));
    let (s0, s1, s3) = (sc(0), sc(1), sc(3));
    let (d1, d3) = ((p1.0 - p0.0, p1.1 - p0.1), (p3.0 - p0.0, p3.1 - p0.1));
    let (e1, e3) = ((s1.0 - s0.0, s1.1 - s0.1), (s3.0 - s0.0, s3.1 - s0.1));
    let det = d1.0 * d3.1 - d3.0 * d1.1;
    if det.abs() < 1e-9 {
        return;
    }
    let a = (e1.0 * d3.1 - e3.0 * d1.1) / det;
    let c = (-e1.0 * d3.0 + e3.0 * d1.0) / det;
    let b = (e1.1 * d3.1 - e3.1 * d1.1) / det;
    let d = (-e1.1 * d3.0 + e3.1 * d1.0) / det;
    let e = s0.0 - a * p0.0 - c * p0.1;
    let f = s0.1 - b * p0.0 - d * p0.1;
    let m = [a, b, c, d, e, f];
    let us = [t[0], t[2], t[4], t[6]];
    let vs = [t[1], t[3], t[5], t[7]];
    let (u0, u1) = (us.iter().copied().fold(f32::MAX, f32::min), us.iter().copied().fold(f32::MIN, f32::max));
    let (v0, v1) = (vs.iter().copied().fold(f32::MAX, f32::min), vs.iter().copied().fold(f32::MIN, f32::max));
    if u1 <= u0 || v1 <= v0 {
        return;
    }
    // Texture coordinates past 0..1 repeat the image: one draw per tile,
    // each clipped to the quad.
    let (ku0, ku1) = ((u0 + 1e-4).floor() as i32, (u1 - 1e-4).ceil() as i32);
    let (kv0, kv1) = ((v0 + 1e-4).floor() as i32, (v1 - 1e-4).ceil() as i32);
    if ((ku1 - ku0).max(1) as i64) * ((kv1 - kv0).max(1) as i64) > 512 {
        return;
    }
    for kv in kv0..kv1.max(kv0 + 1) {
        let (a0, a1) = ((kv as f32).max(v0), ((kv + 1) as f32).min(v1));
        if a1 <= a0 {
            continue;
        }
        for ku in ku0..ku1.max(ku0 + 1) {
            let (b0, b1) = ((ku as f32).max(u0), ((ku + 1) as f32).min(u1));
            if b1 <= b0 {
                continue;
            }
            let src = [(b0 - ku as f32) * w, (a0 - kv as f32) * hh, (b1 - b0) * w, (a1 - a0) * hh];
            let dst = [b0 * w, a0 * hh, (b1 - b0) * w, (a1 - a0) * hh];
            emit(h, Cmd::ImageAffine { uri: uri.clone(), src, dst, m, clip: p, alpha });
        }
    }
}

native!(n_draw_image_quad, |l| {
    let n = l.top();
    let img = img_arg(l);
    let pts = arg_f32s(l, 2, 8);
    let p: [f32; 8] = pts.try_into().unwrap();
    let (t, stack) = match n {
        17 | 18 => (arg_f32s(l, 10, 8).try_into().unwrap(), if n == 18 { l.int(18) } else { 1 }),
        10 => ([0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0], l.int(10)),
        _ => ([0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0], 1),
    };
    with_host(|h| {
        let color = h.color;
        if color[3] <= 0.0 {
            return;
        }
        match img {
            None => emit(h, Cmd::Poly { pts: p, color }),
            Some(id) => {
                let layer = (stack.max(1) - 1) as u32;
                if let Some((uri, w, hh)) = images::uri(id, layer, [color[0], color[1], color[2]]) {
                    if w > 0 && hh > 0 {
                        quad_image(h, uri, w as f32, hh as f32, p, t, color[3]);
                    }
                }
            }
        }
    });
    0
});

/// POB rounds text heights to even pixels above 1.
fn text_height(h: f64) -> f32 {
    let s = h.round() as i64;
    if s <= 1 { 1.0 } else { ((s + 1) & !1) as f32 }
}

/// The text to draw for `s`: translated unless raw or switched off.
fn shown(h: &mut Host, s: &str) -> Arc<str> {
    if h.raw_text || !h.shared.translate.load(Ordering::Relaxed) {
        return Arc::from(s);
    }
    h.tr.get(s).unwrap_or_else(|| Arc::from(s))
}

native!(n_draw_string, |l| {
    let (x, y) = (l.num(1) as f32, l.num(2) as f32);
    let align = Align::parse(&l.string(3).unwrap_or_default());
    let height = text_height(l.num(4));
    let kind = FontKind::parse(&l.string(5).unwrap_or_default());
    let Some(s) = l.string(6) else { return 0 };
    with_host(|h| {
        if let Some((label, value, at)) = label_and_value(h, kind, height, align, &s) {
            draw_text(h, kind, height, &label, x, y, align);
            draw_text(h, kind, height, value, x + at, y, align);
            return;
        }
        let s = shown(h, &s);
        draw_text(h, kind, height, &s, x, y, align);
    });
    0
});

/// "Current build:  Name", drawn left: POB puts what follows the label where
/// the English label ends (the name's box is drawn there). The label
/// translated, the value as it is, and where the value goes from `x`: when
/// the translation is the shorter, so the value stays where POB put it.
fn label_and_value<'a>(h: &mut Host, kind: FontKind, height: f32, align: Align, s: &'a str) -> Option<(Arc<str>, &'a str, f32)> {
    if !matches!(align, Align::Left) || h.raw_text || !h.shared.translate.load(Ordering::Relaxed) {
        return None;
    }
    let (label, value) = s.split_once(":  ")?;
    if label.is_empty() || value.is_empty() || label.contains(['\n', '^']) {
        return None;
    }
    let english = format!("{label}:");
    let translated = shown(h, &english);
    if *translated == *english {
        return None;
    }
    // Where POB put the value: in a box it draws at a place of its own for some (the build's name: `x + 91` in
    // Build.lua, inside its border), else where the English ends.
    let at = match label {
        "Current build" => 95.0,
        _ => text::string_width(kind, height, &format!("{english}  ")),
    };
    (text::string_width(kind, height, &translated) < at).then_some((translated, value, at))
}

/// Draws `s` (its colour escapes, its lines) at `x`, `y`, as `DrawString` does.
fn draw_text(h: &mut Host, kind: FontKind, height: f32, s: &str, x: f32, y: f32, align: Align) {
    let (runs, _) = text::layout(kind, height, s, x, y, align, h.viewport[2].max(h.screen.0), h.color);
    if runs.is_empty() {
        return;
    }
    let size = text::em_size(height);
    let font: Arc<str> = Arc::from(kind.css(size).as_str());
    let baseline = text::baseline(kind, size, height);
    for r in runs {
        if r.color[3] <= 0.0 {
            continue;
        }
        emit(h, Cmd::Text { x: r.x, y: r.y, baseline, font: font.clone(), text: r.text, color: r.color });
    }
}

native!(n_draw_string_width, |l| {
    let height = text_height(l.num(1));
    let kind = FontKind::parse(&l.string(2).unwrap_or_default());
    let s = l.string(3).unwrap_or_default();
    let w = with_host(|h| {
        let s = shown(h, &s);
        text::string_width(kind, height, &s)
    })
    .unwrap_or(0.0);
    l.push_num(w as f64);
    1
});

native!(n_draw_string_cursor_index, |l| {
    let height = text_height(l.num(1));
    let kind = FontKind::parse(&l.string(2).unwrap_or_default());
    let s = l.string(3).unwrap_or_default();
    let i = text::cursor_index(kind, height, &s, l.num(4) as f32, l.num(5) as f32);
    l.push_int(i as i64 + 1);
    1
});

native!(n_strip_escapes, |l| {
    let s = l.bytes(1).unwrap_or_default();
    l.push_bytes(&text::strip_escapes(s));
    1
});

native!(n_set_raw_text, |l| {
    let raw = l.bool(1);
    with_host(|h| h.raw_text = raw);
    0
});

// `s` as it is shown, raw text or not: for the labels of edit boxes, which draw raw.
native!(n_translate, |l| {
    let Some(s) = l.string(1) else { return 0 };
    let t = with_host(|h| {
        let raw = std::mem::replace(&mut h.raw_text, false);
        let t = shown(h, &s);
        h.raw_text = raw;
        t
    });
    match t {
        Some(t) => l.push_str(&t),
        None => l.push_str(&s),
    }
    1
});

// The focused edit box, in the current viewport: where input methods put their text.
native!(n_set_text_input, |l| {
    let r = [l.num(1) as f32, l.num(2) as f32, l.num(3) as f32, l.num(4) as f32];
    with_host(|h| h.text_input = Some([h.viewport[0] + r[0], h.viewport[1] + r[1], r[2], r[3]]));
    0
});

native!(n_get_screen_size, |l| {
    let (w, h) = with_host(|h| h.screen).unwrap_or((1280.0, 800.0));
    l.push_int(w as i64);
    l.push_int(h as i64);
    2
});

native!(n_get_cursor_pos, |l| {
    let (x, y) = *shared().cursor.lock().unwrap();
    l.push_int(x.round() as i64);
    l.push_int(y.round() as i64);
    2
});

native!(n_is_key_down, |l| {
    let name = l.string(1).unwrap_or_default();
    let down = shared().keys.lock().unwrap().contains(&normalize_key(&name));
    l.push_bool(down);
    1
});

native!(n_copy, |l| {
    if let Some(s) = l.string(1) {
        if let Ok(mut c) = arboard::Clipboard::new() {
            let _ = c.set_text(s);
        }
    }
    0
});

native!(n_paste, |l| {
    match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
        Ok(s) => {
            l.push_str(&s);
            1
        }
        Err(_) => 0,
    }
});

native!(n_deflate, |l| {
    let data = l.bytes(1).unwrap_or_default().to_vec();
    let gzip = l.bool(2);
    let out = if gzip {
        let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::best());
        e.write_all(&data).and_then(|_| e.finish())
    } else {
        let mut e = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::best());
        e.write_all(&data).and_then(|_| e.finish())
    };
    match out {
        Ok(b) => {
            l.push_bytes(&b);
            1
        }
        Err(e) => {
            l.push_nil();
            l.push_str(&e.to_string());
            2
        }
    }
});

native!(n_inflate, |l| {
    let data = l.bytes(1).unwrap_or_default().to_vec();
    let mut out = Vec::new();
    let r = if data.starts_with(&[0x1f, 0x8b]) {
        flate2::read::GzDecoder::new(data.as_slice()).read_to_end(&mut out)
    } else {
        flate2::read::ZlibDecoder::new(data.as_slice()).read_to_end(&mut out)
    };
    match r {
        Ok(_) => {
            l.push_bytes(&out);
            1
        }
        Err(e) => {
            l.push_nil();
            l.push_str(&e.to_string());
            2
        }
    }
});

native!(n_get_time, |l| {
    l.push_int(with_host(|h| h.start.elapsed().as_millis() as i64).unwrap_or(0));
    1
});

fn slash(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

// Script path, runtime path, user path.
native!(n_paths, |l| {
    let (pob, user) = with_host(|h| (h.pob_dir.clone(), h.user_dir.clone())).unwrap();
    l.push_str(&slash(&pob));
    l.push_str(&slash(&pob));
    match user {
        Some(u) => l.push_str(&slash(&u)),
        None => l.push_nil(),
    }
    3
});

native!(n_make_dir, |l| {
    let p = l.string(1).unwrap_or_default();
    match std::fs::create_dir(&p) {
        Ok(()) => {
            l.push_bool(true);
            1
        }
        Err(e) => {
            l.push_nil();
            l.push_str(&e.to_string());
            2
        }
    }
});

native!(n_remove_dir, |l| {
    let p = l.string(1).unwrap_or_default();
    let r = if l.bool(2) { std::fs::remove_dir_all(&p) } else { std::fs::remove_dir(&p) };
    match r {
        Ok(()) => {
            l.push_bool(true);
            1
        }
        Err(e) => {
            l.push_nil();
            l.push_str(&e.to_string());
            2
        }
    }
});

native!(n_set_window_title, |l| {
    if let Some(t) = l.string(1) {
        *shared().title.lock().unwrap() = t;
    }
    0
});

native!(n_open_url, |l| {
    if let Some(url) = l.string(1) {
        let _ = open_url(&url);
    }
    0
});

pub fn open_url(url: &str) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd").arg("/C").arg("start").arg("").raw_arg(format!("\"{url}\"")).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn()?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn()?;
    }
    Ok(())
}

native!(n_spawn_process, |l| {
    let cmd = l.string(1).unwrap_or_default();
    let args = l.string(2).unwrap_or_default();
    // POB's runtime update: its `Update.exe` would replace the DLLs this process has loaded, then open POB's own
    // program. POBT applies it itself, in a new POBT (`install::apply_runtime_update`).
    if Path::new(&cmd).file_stem().is_some_and(|s| s.eq_ignore_ascii_case("Update")) && args.contains("UpdateApply.lua") {
        shared().runtime_update.store(true, Ordering::SeqCst);
        return 0;
    }
    let mut c = std::process::Command::new(&cmd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.raw_arg(&args);
    }
    #[cfg(not(windows))]
    c.args(args.split_whitespace());
    if let Err(e) = c.spawn() {
        log::warn!("SpawnProcess {cmd}: {e}");
    }
    0
});

native!(n_exit, |_l| {
    shared().exited.store(true, Ordering::SeqCst);
    0
});

native!(n_restart, |_l| {
    with_host(|h| h.restart = true);
    0
});

native!(n_step, |_l| {
    shared().loading.lock().unwrap().steps += 1;
    0
});

native!(n_log, |l| {
    let s = l.string(1).unwrap_or_default();
    if !shared().loaded.load(Ordering::SeqCst) && !s.trim().is_empty() {
        shared().loading.lock().unwrap().message = s.trim().to_string();
    }
    log::info!(target: "pob", "{}", s.trim_end());
    0
});

native!(n_img_load, |l| {
    let path = l.string(1).unwrap_or_default();
    let (id, w, h, n) = images::load(Path::new(&path));
    l.push_int(id as i64);
    l.push_int(w as i64);
    l.push_int(h as i64);
    l.push_int(n as i64);
    4
});

// `ImgUri(id, layer)`: the file the screens load for an image handle's layer (0-based: a texture array's), and
// its size; nothing when it has none.
native!(n_img_uri, |l| {
    match images::uri(l.int(1) as u32, l.int(2).max(0) as u32, [1.0, 1.0, 1.0]) {
        Some((uri, w, h)) => {
            l.push_str(&uri);
            l.push_int(w as i64);
            l.push_int(h as i64);
            3
        }
        None => 0,
    }
});

// `ImgAtlas(id)`: an image handle's layers packed into pages (images::atlas's JSON); nothing when it has none.
native!(n_img_atlas, |l| {
    match images::atlas(l.int(1) as u32) {
        Some(json) => {
            l.push_str(&json);
            1
        }
        None => 0,
    }
});

native!(n_art_load, |l| {
    let path = l.string(1).unwrap_or_default();
    match images::art_load(Path::new(&path)) {
        Some((id, w, h)) => {
            l.push_int(id as i64);
            l.push_int(w as i64);
            l.push_int(h as i64);
            3
        }
        None => 0,
    }
});

native!(n_art_rect, |l| {
    match images::art_rect(l.int(1) as u32, l.int(2), l.int(3), l.int(4), l.int(5)) {
        Some((id, w, h)) => {
            l.push_int(id as i64);
            l.push_int(w as i64);
            l.push_int(h as i64);
            3
        }
        None => 0,
    }
});

native!(n_art_arc, |l| {
    match images::art_arc(l.int(1) as u32, l.int(2), l.int(3), l.int(4), l.int(5)) {
        Some((id, w, h)) => {
            l.push_int(id as i64);
            l.push_int(w as i64);
            l.push_int(h as i64);
            3
        }
        None => 0,
    }
});

fn wildcard(pattern: &[u8], name: &[u8]) -> bool {
    match (pattern.first(), name.first()) {
        (None, None) => true,
        (Some(b'*'), _) => wildcard(&pattern[1..], name) || (!name.is_empty() && wildcard(pattern, &name[1..])),
        (Some(b'?'), Some(_)) => wildcard(&pattern[1..], &name[1..]),
        (Some(p), Some(n)) if p.eq_ignore_ascii_case(n) => wildcard(&pattern[1..], &name[1..]),
        _ => false,
    }
}

// `NewFileSearch`: a table of `{ name, size, modified }` matches.
native!(n_file_search, |l| {
    let spec = l.string(1).unwrap_or_default().replace('\\', "/");
    let dirs_only = l.bool(2);
    let (dir, pattern) = match spec.rfind('/') {
        Some(i) => (spec[..i].to_string(), spec[i + 1..].to_string()),
        None => (".".to_string(), spec.clone()),
    };
    let dir = if dir.is_empty() { "/".to_string() } else { dir };
    let mut entries: Vec<(String, u64, f64)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() != dirs_only {
                continue;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            if !wildcard(pattern.as_bytes(), name.as_bytes()) {
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0);
            entries.push((name, meta.len(), modified));
        }
    }
    entries.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    l.new_table();
    for (i, (name, size, modified)) in entries.iter().enumerate() {
        l.new_table();
        l.push_str(name);
        l.set_field(-2, "name");
        l.push_num(*size as f64);
        l.set_field(-2, "size");
        l.push_num(*modified);
        l.set_field(-2, "modified");
        l.raw_seti(-2, i as i32 + 1);
    }
    1
});

native!(n_launch_subscript, |l| {
    let script = l.bytes(1).unwrap_or_default().to_vec();
    let funcs = l.string(2).unwrap_or_default();
    let subs = l.string(3).unwrap_or_default();
    let args = if l.top() >= 4 { l.values_from(4) } else { Vec::new() };
    match launch_subscript(script, funcs, subs, args) {
        Some(id) => l.push_light(id as usize as *mut _),
        None => l.push_nil(),
    }
    1
});

native!(n_abort_subscript, |l| {
    let id = l.userdata(1) as usize as u32;
    // The thread runs to its end; its results are dropped.
    with_host(|h| h.subs.remove(&id));
    0
});

native!(n_is_subscript_running, |l| {
    let id = l.userdata(1) as usize as u32;
    let running = with_host(|h| h.subs.get(&id).is_some_and(|s| s.running)).unwrap_or(false);
    l.push_bool(running);
    1
});

#[allow(dead_code)]
fn is_table(l: Lua, idx: i32) -> bool {
    l.kind(idx) == LUA_TTABLE
}

#[cfg(test)]
mod tests {
    /// The prelude loads in POB's LuaJIT: a syntax error in it would stop
    /// POB before its first frame. Needs a Path of Building for its
    /// `lua51.dll`: `POB_DIR=<folder> cargo test --lib prelude_loads`.
    #[test]
    fn prelude_loads() {
        let Some(dir) = std::env::var_os("POB_DIR") else {
            eprintln!("POB_DIR not set: skipped");
            return;
        };
        crate::lua::init(std::path::Path::new(&dir)).unwrap();
        let l = crate::lua::Lua::new().unwrap();
        let loaded = l.load(super::PRELUDE.as_bytes(), "prelude.lua");
        let broken = l.load(b"local s = \"a
b\"", "broken.lua");
        l.close();
        loaded.unwrap();
        assert!(broken.is_err(), "a string cut by a newline must not load");
    }

    /// The whole of POB from `POB_DIR` loads and draws its first screen, as
    /// the launcher starts it; then quits. Ignored by default: it takes a few
    /// seconds and changes the process's folder.
    #[test]
    #[ignore = "runs the whole of POB"]
    fn pob_starts() {
        let Some(dir) = std::env::var_os("POB_DIR").map(PathBuf::from) else {
            eprintln!("POB_DIR not set: skipped");
            return;
        };
        let shared = Shared::new();
        let thread = super::start(dir, shared.clone()).unwrap();
        let begin = std::time::Instant::now();
        while !shared.loaded.load(std::sync::atomic::Ordering::SeqCst) && begin.elapsed().as_secs() < 120 {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        // Its update check (a sub script, over lcurl) runs as it starts.
        std::thread::sleep(std::time::Duration::from_secs(8));
        assert_eq!(shared.error.lock().unwrap().clone(), None);
        assert!(shared.loaded.load(std::sync::atomic::Ordering::SeqCst), "POB did not load in 2 minutes");
        let frame = shared.frame.lock().unwrap().clone();
        let texts: Vec<_> = frame
            .items
            .iter()
            .filter_map(|i| match &i.cmd {
                Cmd::Text { text, .. } => Some(text.to_string()),
                _ => None,
            })
            .collect();
        eprintln!("loaded in {:?}; first screen: {texts:?}", begin.elapsed());
        assert!(texts.iter().any(|t| t.contains("Build")), "{texts:?}");
        assert!(!texts.iter().any(|t| t.starts_with("Error")), "{texts:?}");
        shared.quit.store(true, std::sync::atomic::Ordering::SeqCst);
        thread.join().unwrap();
    }

    use std::{path::PathBuf, sync::Arc};

    use super::{Input, Shared};
    use crate::{
        frame::Cmd,
        lua::{Lua, Value},
    };

    /// The demo (`demo.lua`: POB's own edit boxes, from `POB_DIR`) run as
    /// POB runs, with no window: input goes to its callbacks as the canvas
    /// sends it, and each frame is drawn and published.
    struct Demo {
        l: Lua,
        shared: Arc<Shared>,
    }

    impl Demo {
        /// The demo, translating to Simplified Chinese; none without `POB_DIR`.
        fn start() -> Option<Self> {
            let Some(dir) = std::env::var_os("POB_DIR").map(PathBuf::from) else {
                eprintln!("POB_DIR not set: skipped");
                return None;
            };
            static DICT: std::sync::Once = std::sync::Once::new();
            DICT.call_once(|| {
                let dict = crate::translate::Dictionary::load("zh-rCN");
                *crate::translate::DICT.write().unwrap() = Some(Arc::new(dict));
            });
            crate::lua::init(&dir).unwrap();
            super::set_dll_directory(&dir);
            // POB loads its modules from its folder (the tests that need one all use it).
            std::env::set_current_dir(&dir).unwrap();
            let shared = Shared::new();
            let l = Lua::new().unwrap();
            super::enter(l, &dir, &shared);
            let boot = l.load(super::PRELUDE.as_bytes(), "pobt/prelude.lua").and_then(|_| l.pcall(0, 0));
            let boot = boot.and_then(|_| l.load(super::DEMO.as_bytes(), "pobt/demo.lua")).and_then(|_| l.pcall(0, 0));
            let demo = Demo { l, shared };
            boot.unwrap();
            super::callback(l, "OnInit", &[]).unwrap();
            demo.frame();
            Some(demo)
        }

        fn frame(&self) {
            super::frame(self.l, &self.shared);
            if let Some(e) = self.shared.error.lock().unwrap().take() {
                panic!("{e}");
            }
        }

        fn send(&self, input: Input) {
            match &input {
                Input::KeyDown(k, _) => self.shared.set_key(k, true),
                Input::KeyUp(k) => self.shared.set_key(k, false),
                Input::Char(_) => {}
            }
            super::dispatch(self.l, &self.shared, &input);
        }

        /// Types `text` a character at a time, as the input method's sink does, then draws.
        fn type_text(&self, text: &str) {
            for c in text.chars() {
                self.send(Input::Char(c.to_string()));
            }
            self.frame();
        }

        /// Presses and releases `key` (POB's name for it), then draws.
        fn press(&self, key: &str) {
            self.send(Input::KeyDown(key.into(), false));
            self.send(Input::KeyUp(key.into()));
            self.frame();
        }

        /// Focuses the box `name`, then draws.
        fn focus(&self, name: &str) {
            self.eval(&format!("demo:Focus('{name}')"));
            self.frame();
        }

        /// The results of the Lua chunk `code`.
        fn eval(&self, code: &str) -> Vec<Value> {
            let base = self.l.top();
            self.l.load(code.as_bytes(), "test").and_then(|_| self.l.pcall(0, crate::lua::LUA_MULTRET)).unwrap();
            let out = self.l.values_from(base + 1);
            self.l.set_top(base);
            out
        }

        fn string(&self, expr: &str) -> String {
            match self.eval(&format!("return {expr}")).first() {
                Some(Value::Str(s)) => String::from_utf8(s.clone()).unwrap(),
                other => panic!("{expr}: {other:?}"),
            }
        }

        fn number(&self, expr: &str) -> f64 {
            match self.eval(&format!("return {expr}")).first() {
                Some(Value::Num(n)) => *n,
                other => panic!("{expr}: {other:?}"),
            }
        }

        /// The box `name`'s text, and its caret (a byte index from 1, as POB keeps it).
        fn edit(&self, name: &str) -> (String, usize) {
            (self.string(&format!("demo.controls.{name}.buf")), self.number(&format!("demo.controls.{name}.caret")) as usize)
        }

        /// The text the last frame drew.
        fn texts(&self) -> Vec<String> {
            let frame = self.shared.frame.lock().unwrap().clone();
            frame
                .items
                .iter()
                .filter_map(|i| match &i.cmd {
                    Cmd::Text { text, .. } => Some(text.to_string()),
                    _ => None,
                })
                .collect()
        }

        fn drew(&self, s: &str) -> bool {
            self.texts().iter().any(|t| t.contains(s))
        }

        /// Where the last frame put the input method (`SetTextInput`).
        fn text_input(&self) -> Option<[f32; 4]> {
            self.shared.frame.lock().unwrap().text_input
        }
    }

    impl Drop for Demo {
        fn drop(&mut self) {
            super::HOST.with(|h| *h.borrow_mut() = None);
            self.l.close();
        }
    }

    /// Typing Chinese and Korean into a box that takes any text, and deleting it
    /// a character at a time: POB deletes a byte at a time, which would leave
    /// half a character.
    #[test]
    fn edit_box_types_and_deletes_whole_characters() {
        let Some(d) = Demo::start() else { return };
        d.type_text("ab中文한");
        assert_eq!(d.edit("plain"), ("ab中文한".into(), 1 + 2 + 3 * 3));
        d.press("BACK");
        assert_eq!(d.edit("plain"), ("ab中文".into(), 1 + 2 + 3 * 2));
        d.press("BACK");
        assert_eq!(d.edit("plain"), ("ab中".into(), 1 + 2 + 3));
        d.press("HOME");
        d.press("RIGHT");
        d.press("RIGHT");
        d.press("DELETE");
        assert_eq!(d.edit("plain"), ("ab".into(), 3));
        d.press("BACK");
        assert_eq!(d.edit("plain"), ("a".into(), 2));
    }

    /// Left and Right step over a whole character, and typing in the middle
    /// of text inserts there.
    #[test]
    fn caret_moves_over_whole_characters() {
        let Some(d) = Demo::start() else { return };
        d.type_text("中文");
        d.press("LEFT");
        assert_eq!(d.edit("plain").1, 4);
        d.type_text("x");
        assert_eq!(d.edit("plain"), ("中x文".into(), 5));
        d.press("RIGHT");
        assert_eq!(d.edit("plain").1, 8);
        d.press("LEFT");
        d.press("LEFT");
        d.press("BACK");
        assert_eq!(d.edit("plain"), ("x文".into(), 1));
    }

    /// Several lines: Backspace at a line's start joins it to the one above,
    /// and over a character of several bytes takes it whole.
    #[test]
    fn multiline_box_deletes_whole_characters() {
        let Some(d) = Demo::start() else { return };
        d.focus("multi");
        assert_eq!(d.edit("multi").0, "中文 한국어 English\n第二行 둘째 줄");
        d.press("BACK");
        d.press("BACK");
        assert_eq!(d.edit("multi").0, "中文 한국어 English\n第二行 둘째");
        d.press("HOME");
        d.press("BACK");
        assert_eq!(d.edit("multi").0, "中文 한국어 English第二行 둘째");
        d.press("BACK");
        assert_eq!(d.edit("multi").0, "中文 한국어 Englis第二行 둘째");
    }

    /// The box with the focus says where its caret is, inside the box, and
    /// further right once text is typed; none once no box has the focus.
    #[test]
    fn focused_box_reports_its_caret() {
        let Some(d) = Demo::start() else { return };
        let empty = d.text_input().expect("the focused box's caret");
        // The plain box: x 160, y 60, 360 by 20.
        assert!(empty[0] >= 160.0 && empty[0] < 170.0, "{empty:?}");
        assert_eq!((empty[1], empty[3]), (60.0, 20.0));
        assert!((empty[0] + empty[2] - 520.0).abs() < 0.5, "{empty:?}");
        d.type_text("中文");
        let typed = d.text_input().unwrap();
        assert!(typed[0] > empty[0] + 10.0 && typed[0] < 520.0, "{typed:?}");
        d.press("HOME");
        assert_eq!(d.text_input().unwrap()[0], empty[0]);
        // The search box's caret is past its prompt.
        d.focus("search");
        assert!(d.text_input().unwrap()[0] > 180.0);
        d.eval("demo:SelectControl()");
        d.frame();
        assert_eq!(d.text_input(), None);
    }

    /// POB's words around a box are translated: its prompt, its placeholder and
    /// labels; what is typed in it is not.
    #[test]
    fn prompts_and_labels_are_translated() {
        let Some(d) = Demo::start() else { return };
        assert!(d.drew("搜索:"), "{:?}", d.texts());
        assert!(d.drew("名称"), "the placeholder: {:?}", d.texts());
        assert!(d.drew("技能宝石"), "a label: {:?}", d.texts());
        assert!(d.drew("备注"), "a label: {:?}", d.texts());
        d.type_text("Search");
        assert_eq!(d.edit("plain").0, "Search");
        assert!(d.texts().iter().any(|t| t == "Search"), "typed text drawn as typed: {:?}", d.texts());
        assert_eq!(d.string("__sg.Translate('Fireball')"), "火球");
    }

    /// A gem is found by its translated name, and kept by its English one, which
    /// shows translated once the box loses the focus.
    #[test]
    fn gem_box_finds_gems_by_translated_name() {
        let Some(d) = Demo::start() else { return };
        d.focus("gem");
        d.type_text("火");
        assert_eq!(d.edit("gem").0, "火");
        assert_eq!(d.string("demo.controls.gem.list[1]"), "Default:Fireball");
        d.type_text("球");
        assert_eq!(d.string("demo.controls.gem.list[1]"), "Default:Fireball");
        assert_eq!(d.string("demo.gemId"), "Fireball");
        d.press("RETURN");
        assert_eq!(d.edit("gem").0, "Fireball");
        assert_eq!(d.string("demo.controls.gem.gems['Default:Fireball'].name"), "Fireball");
        assert!(d.drew("火球"), "{:?}", d.texts());
        // Unfocused, the box itself shows the gem translated (it draws through its parent proxy).
        d.focus("multi");
        d.frame();
        assert!(d.drew("火球"), "{:?}", d.texts());
        assert!(!d.drew("Fireball"), "{:?}", d.texts());
        // English still finds it.
        d.focus("gem");
        d.eval("demo.controls.gem:SetText('')");
        d.type_text("frost");
        assert_eq!(d.string("demo.controls.gem.list[1]"), "Default:Frostbolt");
    }

    /// A click focuses the box under the mouse and puts the caret there; the
    /// boxes draw with the mouse over them (tooltips, the gem list).
    #[test]
    fn click_focuses_and_hover_draws() {
        let Some(d) = Demo::start() else { return };
        *d.shared.cursor.lock().unwrap() = (300.0, 270.0);
        d.press("LEFTBUTTON");
        assert_eq!(d.number("demo.selControl == demo.controls.gem and 1 or 0"), 1.0);
        let rect = d.text_input().unwrap();
        assert_eq!((rect[1], rect[3]), (260.0, 20.0));
        // Over the open gem list for a few frames.
        *d.shared.cursor.lock().unwrap() = (300.0, 290.0);
        for _ in 0..4 {
            d.frame();
        }
        *d.shared.cursor.lock().unwrap() = (300.0, 160.0);
        d.press("LEFTBUTTON");
        d.frame();
        assert_eq!(d.number("demo.selControl == demo.controls.multi and 1 or 0"), 1.0);
        assert!(d.edit("gem").0.is_empty());
    }

    /// A box with POB's default filter (its rename boxes, an item's name): POB
    /// takes letters, digits and punctuation only unless it runs with a global
    /// `utf8` table (`main.unicode`); POBT lets it take other scripts too.
    #[test]
    fn default_filter_takes_other_scripts() {
        let Some(d) = Demo::start() else { return };
        d.focus("default");
        d.type_text("a中b");
        assert_eq!(d.edit("default").0, "a中b");
    }

    /// Backspace in a gem box takes a whole character too, and the search follows.
    #[test]
    fn gem_box_deletes_whole_characters() {
        let Some(d) = Demo::start() else { return };
        d.focus("gem");
        d.type_text("寒冰");
        d.press("BACK");
        assert_eq!(d.edit("gem"), ("寒".into(), 4));
        assert_eq!(d.string("demo.controls.gem.list[1]"), "Default:Frostbolt");
    }
}
