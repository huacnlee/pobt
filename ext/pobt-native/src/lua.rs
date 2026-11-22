//! A minimal binding to the LuaJIT shipped with Path of Building
//! (`lua51.dll`), loaded at run time so POB's own native modules (lcurl,
//! lzip, lua-utf8) share the one VM.
//!
//! Native functions never raise Lua errors: `lua_error` unwinds with SEH
//! across Rust frames. Argument checks that must raise live in the Lua
//! prelude instead.

#![allow(non_camel_case_types, non_snake_case, clippy::missing_safety_doc)]

use std::{
    ffi::{CStr, CString, c_char, c_int, c_void},
    path::{Path, PathBuf},
    sync::OnceLock,
};

pub type lua_State = c_void;
pub type lua_CFunction = unsafe extern "C" fn(*mut lua_State) -> c_int;

pub const LUA_REGISTRYINDEX: c_int = -10000;
pub const LUA_GLOBALSINDEX: c_int = -10002;
pub const LUA_MULTRET: c_int = -1;

pub const fn upvalue_index(i: c_int) -> c_int {
    LUA_GLOBALSINDEX - i
}

pub const LUA_TNIL: c_int = 0;
pub const LUA_TBOOLEAN: c_int = 1;
pub const LUA_TLIGHTUSERDATA: c_int = 2;
pub const LUA_TNUMBER: c_int = 3;
pub const LUA_TSTRING: c_int = 4;
pub const LUA_TTABLE: c_int = 5;

macro_rules! lua_api {
    ($($name:ident: fn($($arg:ty),*) $(-> $ret:ty)?;)*) => {
        pub struct Api {
            _lib: libloading::Library,
            $(pub $name: unsafe extern "C" fn($($arg),*) $(-> $ret)?,)*
        }

        impl Api {
            unsafe fn load(lib: libloading::Library) -> Result<Self, libloading::Error> {
                unsafe {
                    Ok(Self {
                        $($name: *lib.get(concat!(stringify!($name), "\0").as_bytes())?,)*
                        _lib: lib,
                    })
                }
            }
        }
    };
}

lua_api! {
    luaL_newstate: fn() -> *mut lua_State;
    luaL_openlibs: fn(*mut lua_State);
    lua_close: fn(*mut lua_State);
    luaL_loadbuffer: fn(*mut lua_State, *const c_char, usize, *const c_char) -> c_int;
    luaL_loadfile: fn(*mut lua_State, *const c_char) -> c_int;
    lua_pcall: fn(*mut lua_State, c_int, c_int, c_int) -> c_int;
    lua_gettop: fn(*mut lua_State) -> c_int;
    lua_settop: fn(*mut lua_State, c_int);
    lua_pushvalue: fn(*mut lua_State, c_int);
    lua_insert: fn(*mut lua_State, c_int);
    lua_remove: fn(*mut lua_State, c_int);
    lua_type: fn(*mut lua_State, c_int) -> c_int;
    lua_pushcclosure: fn(*mut lua_State, lua_CFunction, c_int);
    lua_pushnumber: fn(*mut lua_State, f64);
    lua_pushinteger: fn(*mut lua_State, isize);
    lua_pushlstring: fn(*mut lua_State, *const c_char, usize);
    lua_pushboolean: fn(*mut lua_State, c_int);
    lua_pushnil: fn(*mut lua_State);
    lua_pushlightuserdata: fn(*mut lua_State, *mut c_void);
    lua_tonumber: fn(*mut lua_State, c_int) -> f64;
    lua_tointeger: fn(*mut lua_State, c_int) -> isize;
    lua_toboolean: fn(*mut lua_State, c_int) -> c_int;
    lua_tolstring: fn(*mut lua_State, c_int, *mut usize) -> *const c_char;
    lua_touserdata: fn(*mut lua_State, c_int) -> *mut c_void;
    lua_getfield: fn(*mut lua_State, c_int, *const c_char);
    lua_setfield: fn(*mut lua_State, c_int, *const c_char);
    lua_rawgeti: fn(*mut lua_State, c_int, c_int);
    lua_rawseti: fn(*mut lua_State, c_int, c_int);
    lua_createtable: fn(*mut lua_State, c_int, c_int);
    lua_objlen: fn(*mut lua_State, c_int) -> usize;
    lua_sethook: fn(*mut lua_State, *const c_void, c_int, c_int) -> c_int;
}

static API: OnceLock<Api> = OnceLock::new();
static LOADED_FROM: OnceLock<PathBuf> = OnceLock::new();

/// The folder whose `lua51.dll` is loaded, once one is: a process keeps it (and
/// POB's native modules, which link to it by name) for good.
pub fn loaded_from() -> Option<&'static Path> {
    LOADED_FROM.get().map(PathBuf::as_path)
}

/// Loads `lua51.dll` from POB's directory. Called once, before any state.
pub fn init(pob_dir: &Path) -> Result<(), String> {
    if API.get().is_some() {
        return Ok(());
    }
    let dll = pob_dir.join("lua51.dll");
    let lib = unsafe { libloading::Library::new(&dll) }
        .map_err(|e| format!("cannot load {}: {e}", dll.display()))?;
    let api = unsafe { Api::load(lib) }.map_err(|e| format!("lua51.dll: {e}"))?;
    let _ = API.set(api);
    let _ = LOADED_FROM.set(pob_dir.to_path_buf());
    Ok(())
}

#[inline]
pub fn api() -> &'static Api {
    API.get().expect("lua51.dll is not loaded")
}

/// A borrowed Lua state with safe-ish helpers over the raw API.
#[derive(Clone, Copy)]
pub struct Lua(pub *mut lua_State);

unsafe impl Send for Lua {}

impl Lua {
    pub fn new() -> Option<Self> {
        let l = unsafe { (api().luaL_newstate)() };
        if l.is_null() {
            return None;
        }
        unsafe { (api().luaL_openlibs)(l) };
        Some(Self(l))
    }

    pub fn close(self) {
        unsafe { (api().lua_close)(self.0) }
    }

    pub fn top(self) -> c_int {
        unsafe { (api().lua_gettop)(self.0) }
    }

    pub fn set_top(self, idx: c_int) {
        unsafe { (api().lua_settop)(self.0, idx) }
    }

    pub fn pop(self, n: c_int) {
        self.set_top(-n - 1)
    }

    pub fn kind(self, idx: c_int) -> c_int {
        unsafe { (api().lua_type)(self.0, idx) }
    }

    pub fn is_none_or_nil(self, idx: c_int) -> bool {
        self.kind(idx) <= LUA_TNIL
    }

    pub fn num(self, idx: c_int) -> f64 {
        unsafe { (api().lua_tonumber)(self.0, idx) }
    }

    pub fn num_or(self, idx: c_int, default: f64) -> f64 {
        if self.kind(idx) == LUA_TNUMBER || self.kind(idx) == LUA_TSTRING {
            self.num(idx)
        } else {
            default
        }
    }

    pub fn int(self, idx: c_int) -> i64 {
        unsafe { (api().lua_tointeger)(self.0, idx) as i64 }
    }

    pub fn bool(self, idx: c_int) -> bool {
        unsafe { (api().lua_toboolean)(self.0, idx) != 0 }
    }

    pub fn bytes(self, idx: c_int) -> Option<&'static [u8]> {
        let mut len = 0usize;
        let p = unsafe { (api().lua_tolstring)(self.0, idx, &mut len) };
        if p.is_null() {
            None
        } else {
            // Valid while the value stays on the stack; callers copy it.
            Some(unsafe { std::slice::from_raw_parts(p as *const u8, len) })
        }
    }

    pub fn string(self, idx: c_int) -> Option<String> {
        self.bytes(idx).map(|b| String::from_utf8_lossy(b).into_owned())
    }

    pub fn userdata(self, idx: c_int) -> *mut c_void {
        unsafe { (api().lua_touserdata)(self.0, idx) }
    }

    pub fn push_nil(self) {
        unsafe { (api().lua_pushnil)(self.0) }
    }

    pub fn push_num(self, n: f64) {
        unsafe { (api().lua_pushnumber)(self.0, n) }
    }

    pub fn push_int(self, n: i64) {
        unsafe { (api().lua_pushinteger)(self.0, n as isize) }
    }

    pub fn push_bool(self, b: bool) {
        unsafe { (api().lua_pushboolean)(self.0, b as c_int) }
    }

    pub fn push_bytes(self, b: &[u8]) {
        unsafe { (api().lua_pushlstring)(self.0, b.as_ptr() as *const c_char, b.len()) }
    }

    pub fn push_str(self, s: &str) {
        self.push_bytes(s.as_bytes())
    }

    pub fn push_light(self, p: *mut c_void) {
        unsafe { (api().lua_pushlightuserdata)(self.0, p) }
    }

    pub fn push_value(self, idx: c_int) {
        unsafe { (api().lua_pushvalue)(self.0, idx) }
    }

    pub fn insert(self, idx: c_int) {
        unsafe { (api().lua_insert)(self.0, idx) }
    }

    pub fn remove(self, idx: c_int) {
        unsafe { (api().lua_remove)(self.0, idx) }
    }

    pub fn push_fn(self, f: lua_CFunction) {
        unsafe { (api().lua_pushcclosure)(self.0, f, 0) }
    }

    /// Pushes `f` closing over the top `n` values.
    pub fn push_closure(self, f: lua_CFunction, n: c_int) {
        unsafe { (api().lua_pushcclosure)(self.0, f, n) }
    }

    pub fn new_table(self) {
        unsafe { (api().lua_createtable)(self.0, 0, 0) }
    }

    pub fn get_field(self, idx: c_int, name: &str) {
        let c = CString::new(name).unwrap();
        unsafe { (api().lua_getfield)(self.0, idx, c.as_ptr()) }
    }

    pub fn set_field(self, idx: c_int, name: &str) {
        let c = CString::new(name).unwrap();
        unsafe { (api().lua_setfield)(self.0, idx, c.as_ptr()) }
    }

    pub fn get_global(self, name: &str) {
        self.get_field(LUA_GLOBALSINDEX, name)
    }

    pub fn set_global(self, name: &str) {
        self.set_field(LUA_GLOBALSINDEX, name)
    }

    pub fn raw_geti(self, idx: c_int, n: c_int) {
        unsafe { (api().lua_rawgeti)(self.0, idx, n) }
    }

    pub fn raw_seti(self, idx: c_int, n: c_int) {
        unsafe { (api().lua_rawseti)(self.0, idx, n) }
    }

    pub fn len(self, idx: c_int) -> usize {
        unsafe { (api().lua_objlen)(self.0, idx) }
    }

    /// Loads a chunk; on failure the error message is returned (and popped).
    pub fn load(self, code: &[u8], name: &str) -> Result<(), String> {
        let chunk = CString::new(format!("@{name}")).unwrap();
        let rc = unsafe {
            (api().luaL_loadbuffer)(self.0, code.as_ptr() as *const c_char, code.len(), chunk.as_ptr())
        };
        if rc != 0 {
            let msg = self.string(-1).unwrap_or_default();
            self.pop(1);
            return Err(msg);
        }
        Ok(())
    }

    /// Calls the function below `nargs` arguments with a traceback handler.
    /// On failure the error (with traceback) is returned and popped.
    pub fn pcall(self, nargs: c_int, nresults: c_int) -> Result<(), String> {
        let base = self.top() - nargs;
        self.get_global("debug");
        self.get_field(-1, "traceback");
        self.remove(-2);
        self.insert(base);
        let rc = unsafe { (api().lua_pcall)(self.0, nargs, nresults, base) };
        self.remove(base);
        if rc != 0 {
            let msg = self.string(-1).unwrap_or_else(|| "(error object is not a string)".into());
            self.pop(1);
            return Err(msg);
        }
        Ok(())
    }

    pub fn register(self, table_idx: c_int, name: &str, f: lua_CFunction) {
        self.push_fn(f);
        let idx = if table_idx < 0 && table_idx > LUA_REGISTRYINDEX { table_idx - 1 } else { table_idx };
        self.set_field(idx, name);
    }
}

pub fn cstr(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
}

/// A plain value passed between the main state and a sub script.
#[derive(Debug, Clone)]
pub enum Value {
    Nil,
    Bool(bool),
    Num(f64),
    Str(Vec<u8>),
}

impl Lua {
    pub fn to_value(self, idx: c_int) -> Value {
        match self.kind(idx) {
            LUA_TBOOLEAN => Value::Bool(self.bool(idx)),
            LUA_TNUMBER => Value::Num(self.num(idx)),
            LUA_TSTRING => Value::Str(self.bytes(idx).unwrap_or_default().to_vec()),
            _ => Value::Nil,
        }
    }

    pub fn push_value_of(self, v: &Value) {
        match v {
            Value::Nil => self.push_nil(),
            Value::Bool(b) => self.push_bool(*b),
            Value::Num(n) => self.push_num(*n),
            Value::Str(s) => self.push_bytes(s),
        }
    }

    /// Values from `from` to the top, as plain values.
    pub fn values_from(self, from: c_int) -> Vec<Value> {
        (from..=self.top()).map(|i| self.to_value(i)).collect()
    }
}

/// Wraps a native function body so a Rust panic never crosses into Lua.
#[macro_export]
macro_rules! native {
    ($name:ident, |$l:ident| $body:block) => {
        unsafe extern "C" fn $name(raw: *mut $crate::lua::lua_State) -> std::ffi::c_int {
            let $l = $crate::lua::Lua(raw);
            match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> std::ffi::c_int { $body })) {
                Ok(n) => n,
                Err(_) => {
                    log::error!(concat!("native ", stringify!($name), " panicked"));
                    0
                }
            }
        }
    };
}
