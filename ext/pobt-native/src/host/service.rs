//! The official Path of Building, with no window, serving POBT's own build screens. It loads as the launcher's POB
//! does, on a thread of its own, and then answers requests: each runs one operation of `service.lua` on the build it
//! holds (open one, read its stats, change it) and returns JSON. The data and the calculations are POB's own, so the
//! screens follow every POB update with nothing in POBT to change.

use std::{
    path::PathBuf,
    sync::{Arc, Mutex, atomic::Ordering, mpsc},
};

use tokio::sync::oneshot;

use super::{CALLBACK_INIT, PRELUDE, Shared, callback, enter, frame, launch, set_dll_directory};
use crate::lua::{self, LUA_MULTRET, Lua, Value};

const SERVICE: &str = include_str!("../service.lua");
/// The Lua of `file` (under `src/`): in a development build the file as it is now, so a change to it needs no Rust
/// rebuild (`nsh run` rebuilds only for Rust), only POBT started again; in a release, the copy built in.
fn source(file: &str, embedded: &'static str) -> std::borrow::Cow<'static, str> {
    if cfg!(debug_assertions) {
        // This file's own path (src/host/service.rs) leads to src/: CARGO_MANIFEST_DIR may be a crate nsh generated
        // elsewhere (.nsh/rust/app-crates), with no Lua beside it.
        let here = std::path::Path::new(file!());
        let here = if here.is_absolute() {
            here.to_path_buf()
        } else {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(here)
        };
        let Some(src) = here.parent().and_then(|p| p.parent()) else {
            return embedded.into();
        };
        let path = src.join(file);
        if let Ok(text) = std::fs::read_to_string(path) {
            return text.into();
        }
    }
    embedded.into()
}

/// The pages' operations (`<page>.<op>`), each a module of its own.
const MODULES: &[(&str, &str)] = &[
    ("skills", include_str!("../service/skills.lua")),
    ("items", include_str!("../service/items.lua")),
    ("config", include_str!("../service/config.lua")),
    ("tree", include_str!("../service/tree.lua")),
    ("calcs", include_str!("../service/calcs.lua")),
    ("notes", include_str!("../service/notes.lua")),
];

struct Job {
    op: String,
    args: String,
    reply: oneshot::Sender<String>,
}

struct Running {
    pob_dir: PathBuf,
    jobs: mpsc::Sender<Job>,
    thread: std::thread::JoinHandle<()>,
}

static RUNNING: Mutex<Option<Running>> = Mutex::new(None);
/// `{ state: "idle" | "loading" | "ready" | "failed", error, version }` as JSON.
static STATUS: Mutex<String> = Mutex::new(String::new());

fn set_status(state: &str, error: &str, version: &str) {
    *STATUS.lock().unwrap() =
        serde_json::json!({ "state": state, "error": error, "version": version }).to_string();
}

/// Where the service stands, as JSON `{ state, error, version }`.
pub fn status() -> String {
    let s = STATUS.lock().unwrap().clone();
    if s.is_empty() {
        r#"{"state":"idle","error":"","version":""}"#.into()
    } else {
        s
    }
}

/// Starts the service on the POB in `pob_dir` unless it runs there; "" once started (it goes on loading: `status`),
/// or why not. The POB of another folder (the other game's) is stopped first, its build dropped; the LuaJIT loaded
/// first serves both, as it does the launcher's POB.
/// The process's folder before Path of Building moved it into its own: what a relative path given by POBT means.
pub static FIRST_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

pub fn start(pob_dir: PathBuf) -> String {
    if let Ok(d) = std::env::current_dir() {
        let _ = FIRST_DIR.set(d);
    }
    let mut running = RUNNING.lock().unwrap();
    if running.as_ref().is_some_and(|r| r.pob_dir == pob_dir) {
        return String::new();
    }
    if let Some(r) = running.take() {
        // No more jobs: `serve` ends after the one it runs, closing its Lua state.
        drop(r.jobs);
        let _ = r.thread.join();
    }
    if let Err(e) = lua::init(&pob_dir) {
        set_status("failed", &e, "");
        return e;
    }
    let (tx, rx) = mpsc::channel::<Job>();
    let dir = pob_dir.clone();
    set_status("loading", "", "");
    let thread = match std::thread::Builder::new()
        .name("pobt-service".into())
        .stack_size(64 << 20)
        .spawn(move || serve(dir, rx))
    {
        Ok(t) => t,
        Err(e) => {
            let why = e.to_string();
            set_status("failed", &why, "");
            return why;
        }
    };
    *running = Some(Running {
        pob_dir,
        jobs: tx,
        thread,
    });
    String::new()
}

/// Runs operation `op` of `service.lua` with `args` (JSON); its answer as JSON `{ ok }` or `{ err }`.
pub async fn request(op: String, args: String) -> String {
    let (reply, rx) = oneshot::channel();
    let sent = RUNNING
        .lock()
        .unwrap()
        .as_ref()
        .map(|r| r.jobs.send(Job { op, args, reply }).is_ok());
    if sent != Some(true) {
        return serde_json::json!({ "err": "Path of Building is not running" }).to_string();
    }
    rx.await
        .unwrap_or_else(|_| serde_json::json!({ "err": "Path of Building stopped" }).to_string())
}

fn serve(pob_dir: PathBuf, jobs: mpsc::Receiver<Job>) {
    set_dll_directory(&pob_dir);
    if let Err(e) = std::env::set_current_dir(&pob_dir) {
        set_status("failed", &format!("{}: {e}", pob_dir.display()), "");
        return;
    }
    let shared = Shared::new();
    // POB's text stays English: the screens translate what they show.
    shared.translate.store(false, Ordering::SeqCst);
    let Some(l) = Lua::new() else {
        set_status("failed", "cannot create a Lua state", "");
        return;
    };
    enter(l, &pob_dir, &shared);
    let failed = |what: &str| {
        shared
            .error
            .lock()
            .unwrap()
            .take()
            .map(|e| format!("{what}: {e}"))
    };
    let boot = (|| -> Result<String, String> {
        l.load(PRELUDE.as_bytes(), "pobt/prelude.lua")
            .and_then(|_| l.pcall(0, 0))?;
        launch(l, &pob_dir)?;
        l.get_global("__pobt_hookLaunch");
        let _ = l.pcall(0, 0);
        callback(l, CALLBACK_INIT, &[])?;
        // The dispatcher, kept as a global for every request.
        l.load(
            source("service.lua", SERVICE).as_bytes(),
            "pobt/service.lua",
        )?;
        l.pcall(0, 1)?;
        l.set_global("__pobt_service");
        for (name, code) in MODULES {
            l.get_global("__pobt_register");
            l.push_str(name);
            let file = format!("service/{name}.lua");
            l.load(source(&file, code).as_bytes(), &format!("pobt/{file}"))?;
            l.pcall(0, 1)?;
            l.pcall(2, 0)?;
        }
        let version = run(l, &shared, "init", "{}")?;
        if let Some(e) = failed("starting") {
            return Err(e);
        }
        Ok(version)
    })();
    match boot {
        Ok(answer) => {
            let version = serde_json::from_str::<serde_json::Value>(&answer)
                .ok()
                .and_then(|v| v["ok"]["version"].as_str().map(str::to_owned))
                .unwrap_or_default();
            set_status("ready", "", &version);
        }
        Err(e) => {
            set_status("failed", &e, "");
            *RUNNING.lock().unwrap() = None;
            return;
        }
    }
    for job in jobs {
        let answer = run(l, &shared, &job.op, &job.args)
            .unwrap_or_else(|e| serde_json::json!({ "err": e }).to_string());
        let _ = job.reply.send(answer);
    }
    l.close();
}

/// One operation: `__pobt_service(op, args)` answers JSON, or asks for frames first (`nil, frames`) and is then called
/// with `"__after"` until it answers, as POB changes mode and recalculates in its frames.
fn run(l: Lua, shared: &Arc<Shared>, op: &str, args: &str) -> Result<String, String> {
    let (mut op, mut args) = (op.to_string(), args.to_string());
    for _ in 0..32 {
        let base = l.top();
        l.get_global("__pobt_service");
        l.push_str(&op);
        l.push_str(&args);
        let called = l.pcall(2, LUA_MULTRET);
        let out = l.values_from(base + 1);
        l.set_top(base);
        called?;
        match out.as_slice() {
            [Value::Str(json), ..] => return Ok(String::from_utf8_lossy(json).into_owned()),
            [Value::Nil, Value::Num(n), ..] => {
                for _ in 0..(*n as u32).max(1) {
                    frame(l, shared);
                }
                if let Some(e) = shared.error.lock().unwrap().take() {
                    return Ok(serde_json::json!({ "err": e }).to_string());
                }
                op = "__after".into();
                args = String::new();
            }
            _ => return Err(format!("service.lua: {op} answered nothing")),
        }
    }
    Err(format!("service.lua: {op} did not settle"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(f)
    }

    /// Needs `POB_DIR` and `POB2_DIR` (both games' Path of Building) and `POBT_TEST_BUILD2` (a PoE2 build's XML):
    /// one process runs one, then the other, as switching games in POBT does.
    #[test]
    fn switches_games() {
        let (Some(dir), Some(dir2), Some(xml)) = (
            std::env::var_os("POB_DIR"),
            std::env::var_os("POB2_DIR"),
            std::env::var_os("POBT_TEST_BUILD2"),
        ) else {
            eprintln!("POB_DIR, POB2_DIR or POBT_TEST_BUILD2 not set: skipped");
            return;
        };
        let ready = || loop {
            let s = status();
            if !s.contains("\"loading\"") {
                break s;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        };
        assert_eq!(start(PathBuf::from(dir)), "");
        assert!(ready().contains("\"ready\""), "{}", status());
        assert_eq!(start(PathBuf::from(dir2)), "");
        assert!(ready().contains("\"ready\""), "{}", status());
        let xml = std::fs::read_to_string(xml).unwrap();
        let opened = block(request(
            "open".into(),
            serde_json::json!({ "xml": xml }).to_string(),
        ));
        assert!(opened.contains("\"ok\""), "{opened}");
    }

    /// Needs `POB_DIR` (an installed Path of Building) and `POBT_TEST_BUILD` (a build's XML); skipped without them.
    #[test]
    fn opens_a_build_and_reads_its_sidebar() {
        let (Some(dir), Some(xml)) = (
            std::env::var_os("POB_DIR"),
            std::env::var_os("POBT_TEST_BUILD"),
        ) else {
            eprintln!("POB_DIR or POBT_TEST_BUILD not set: skipped");
            return;
        };
        let xml = std::fs::read_to_string(xml).unwrap();
        assert_eq!(start(PathBuf::from(dir)), "");
        let opened = block(request(
            "open".into(),
            serde_json::json!({ "xml": xml }).to_string(),
        ));
        assert!(opened.contains("\"ok\""), "{opened}");
        let sidebar = block(request("sidebar".into(), String::new()));
        let v: serde_json::Value = serde_json::from_str(&sidebar).unwrap();
        let lines = v["ok"]["lines"]
            .as_array()
            .unwrap_or_else(|| panic!("{sidebar}"));
        eprintln!(
            "{}",
            serde_json::to_string_pretty(&v["ok"]["summary"]).unwrap()
        );
        for l in lines.iter().take(40) {
            eprintln!(
                "{} | {}",
                l["left"].as_str().unwrap_or(""),
                l["right"].as_str().unwrap_or("")
            );
        }
        assert!(
            lines
                .iter()
                .any(|l| l["left"].as_str().is_some_and(|s| s.contains("Life"))),
            "{sidebar}"
        );
        // POBT_TEST_OPS: more operations to try, as JSON [[op, args], ...]; each answer is printed.
        if let Some(extra) = std::env::var_os("POBT_TEST_OPS") {
            let list: Vec<(String, serde_json::Value)> =
                serde_json::from_str(&extra.to_string_lossy()).unwrap();
            for (op, args) in list {
                let answer = block(request(op.clone(), args.to_string()));
                let end = answer
                    .char_indices()
                    .nth(4000)
                    .map_or(answer.len(), |(i, _)| i);
                eprintln!("== {op}: {}", &answer[..end]);
            }
        }
        let code = block(request("export".into(), String::new()));
        assert!(
            code.contains("\"code\""),
            "{}",
            &code[..code.len().min(300)]
        );
    }
}
