//! The launcher's choices, kept in `%APPDATA%\pobt\settings.json`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum Game {
    #[default]
    Poe1,
    Poe2,
}

impl Game {
    pub fn label(self) -> &'static str {
        match self {
            Game::Poe1 => "流放之路",
            Game::Poe2 => "流放之路 2",
        }
    }

    pub fn exe(self) -> &'static str {
        match self {
            Game::Poe1 => "Path of Building.exe",
            Game::Poe2 => "Path of Building-PoE2.exe",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub poe1_dir: Option<PathBuf>,
    pub poe2_dir: Option<PathBuf>,
    pub game: Game,
    /// The translation directory's name (`zh-rCN`, ...), or none for English.
    pub language: Option<String>,
}

fn file() -> Option<PathBuf> {
    let dir = dirs::config_dir()?.join("pobt");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("settings.json"))
}

impl Settings {
    pub fn load() -> Self {
        let mut s: Settings = file()
            .and_then(|f| std::fs::read(f).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_else(|| Settings { language: Some("zh-rCN".into()), ..Default::default() });
        if s.poe1_dir.as_deref().is_none_or(|d| !is_pob_dir(d, Game::Poe1)) {
            s.poe1_dir = detect(Game::Poe1);
        }
        if s.poe2_dir.as_deref().is_none_or(|d| !is_pob_dir(d, Game::Poe2)) {
            s.poe2_dir = detect(Game::Poe2);
        }
        s
    }

    pub fn save(&self) {
        if let (Some(f), Ok(json)) = (file(), serde_json::to_vec_pretty(self)) {
            let _ = std::fs::write(f, json);
        }
    }

    pub fn dir(&self, game: Game) -> Option<&Path> {
        match game {
            Game::Poe1 => self.poe1_dir.as_deref(),
            Game::Poe2 => self.poe2_dir.as_deref(),
        }
    }

    pub fn set_dir(&mut self, game: Game, dir: Option<PathBuf>) {
        match game {
            Game::Poe1 => self.poe1_dir = dir,
            Game::Poe2 => self.poe2_dir = dir,
        }
    }
}

/// A Path of Building install we can run: its Launch.lua and its LuaJIT.
pub fn is_pob_dir(dir: &Path, game: Game) -> bool {
    dir.join("Launch.lua").is_file() && dir.join("lua51.dll").is_file() && dir.join(game.exe()).is_file()
}

fn detect(game: Game) -> Option<PathBuf> {
    let names: &[&str] = match game {
        Game::Poe1 => &["Path of Building Community", "PathOfBuildingCommunity", "Path of Building"],
        Game::Poe2 => &["Path of Building Community (PoE2)", "PathOfBuildingCommunity-PoE2", "Path of Building-PoE2"],
    };
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(d) = dirs::data_dir() {
        roots.push(d);
    }
    if let Some(d) = dirs::data_local_dir() {
        roots.push(d.join("Programs"));
        roots.push(d);
    }
    if let Ok(exe) = std::env::current_exe() {
        roots.extend(exe.ancestors().skip(1).take(4).map(Path::to_path_buf));
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramData"] {
        if let Some(p) = std::env::var_os(var) {
            roots.push(PathBuf::from(p));
        }
    }
    roots.push(PathBuf::from("C:\\Games\\PoeCharm2"));
    roots.push(PathBuf::from("C:\\PoeCharm2"));
    roots
        .iter()
        .flat_map(|r| names.iter().map(move |n| r.join(n)))
        .find(|d| is_pob_dir(d, game))
}

/// The translation data: `trs` next to the program, or in the
/// source tree when run from `target/`.
pub fn translate_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .skip(1)
        .take(5)
        .flat_map(|d| [d.join("trs")])
        .chain(std::iter::once(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("trs")))
        .find(|d| d.join("languages.json").is_file())
}

#[derive(Debug, Clone, Deserialize)]
pub struct Language {
    pub name: String,
    pub value: String,
}

/// The languages `languages.json` lists that have a directory.
pub fn languages() -> Vec<Language> {
    let Some(root) = translate_root() else { return Vec::new() };
    let list: Vec<Language> = std::fs::read(root.join("languages.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    let mut list: Vec<Language> = list.into_iter().filter(|l| root.join(&l.value).is_dir()).collect();
    // Directories the list leaves out, under their own names.
    let mut extra: Vec<String> = std::fs::read_dir(&root)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|v| !list.iter().any(|l| &l.value == v))
        .collect();
    extra.sort();
    list.extend(extra.into_iter().map(|value| Language { name: language_name(&value), value }));
    list
}

fn language_name(value: &str) -> String {
    match value {
        "ko-KR" => "한국어".into(),
        "zh-rCN" => "简体中文".into(),
        "zh-rTW" => "繁體中文".into(),
        v => v.into(),
    }
}
