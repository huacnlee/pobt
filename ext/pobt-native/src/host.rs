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

    let boot = l.load(PRELUDE.as_bytes(), "pobt/prelude.lua").and_then(|_| l.pcall(0, 0));
    let script = std::fs::read(pob_dir.join("Launch.lua"));
    let boot = boot.and_then(|_| script.map_err(|e| format!("Launch.lua: {e}")));
    let boot = boot.and_then(|code| {
        let code = code.strip_prefix(b"#@".as_slice()).map(|c| {
            // SimpleGraphic's "#@ SimpleGraphic" first line is not Lua.
            let nl = c.iter().position(|&b| b == b'\n').unwrap_or(c.len());
            let mut v = b"--".to_vec();
            v.extend_from_slice(&c[nl..]);
            v
        });
        let code = code.unwrap_or_else(|| std::fs::read(pob_dir.join("Launch.lua")).unwrap_or_default());
        l.load(&code, "Launch.lua")?;
        l.pcall(0, 0)
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
    if !shared.loaded.load(Ordering::SeqCst) {
        let steps = shared.loading.lock().unwrap().steps;
        crate::loading::remember(pob_dir, steps);
    }

    let mut frames = 0u64;
    loop {
        let begin = Instant::now();
        // Input.
        while let Ok(input) = rx.try_recv() {
            let (name, args): (&str, Vec<Value>) = match &input {
                Input::KeyDown(k, dbl) => ("OnKeyDown", vec![Value::Str(k.clone().into_bytes()), Value::Bool(*dbl)]),
                Input::KeyUp(k) => ("OnKeyUp", vec![Value::Str(k.clone().into_bytes()), Value::Bool(false)]),
                Input::Char(c) => ("OnChar", vec![Value::Str(c.clone().into_bytes()), Value::Bool(false)]),
            };
            if let Err(e) = callback(l, name, &args) {
                report(shared, &format!("Error in {name}"), e);
            }
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

        // The frame.
        let screen = *shared.screen.lock().unwrap();
        with_host(|h| {
            h.items.clear();
            h.seq = 0;
            h.layer = (0, 0);
            h.screen = screen;
            h.viewport = [0.0, 0.0, screen.0, screen.1];
            h.color = [1.0; 4];
        });
        l.get_global("__pobt_hookClasses");
        let _ = l.pcall(0, 0);
        let result = callback(l, "OnFrame", &[]);
        if let Err(e) = result {
            report(shared, "Error in OnFrame", e);
        }
        publish(shared);
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
        Frame { width: h.screen.0, height: h.screen.1, clear: h.clear, items, images: h.images.clone() }
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
        let s = shown(h, &s);
        let (runs, _) = text::layout(kind, height, &s, x, y, align, h.viewport[2].max(h.screen.0), h.color);
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
    });
    0
});

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
    #[cfg(not(windows))]
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
