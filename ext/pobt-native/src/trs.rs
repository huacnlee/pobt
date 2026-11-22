//! The translation data: the `trs` folder beside the program (or in the
//! source tree when run from it), plain CSV files the user may edit.

use std::path::PathBuf;

use serde::Deserialize;

/// The `trs` folder beside the program, or up to a few folders above it (a
/// development run's program sits deep in the source tree), if there is one.
pub fn root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .skip(1)
        .take(6)
        .map(|d| d.join("trs"))
        .find(|d| d.join("languages.json").is_file())
        .or_else(|| {
            // Tests run from cargo's target folder, wherever it is.
            let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../trs");
            (cfg!(test) && source.is_dir()).then_some(source)
        })
}

/// The CSV files of `language`, sorted by name.
pub fn files(language: &str) -> Vec<(String, Vec<u8>)> {
    let Some(dir) = root().map(|r| r.join(language)) else {
        log::warn!("no trs folder beside the program: nothing to translate with");
        return Vec::new();
    };
    let mut out: Vec<_> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("csv")))
        .filter_map(|p| {
            let name = p.file_name()?.to_string_lossy().into_owned();
            Some((name, std::fs::read(&p).ok()?))
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

#[derive(Debug, Clone, Deserialize)]
pub struct Language {
    pub name: String,
    pub value: String,
}

fn language_name(value: &str) -> String {
    match value {
        "ko-KR" => "한국어".into(),
        "zh-rCN" => "简体中文".into(),
        "zh-rTW" => "繁體中文".into(),
        v => v.into(),
    }
}

/// The languages there are translations of: those `languages.json` lists,
/// then any other folder under its own name.
pub fn languages() -> Vec<Language> {
    let Some(root) = root() else { return Vec::new() };
    let listed: Vec<Language> = std::fs::read(root.join("languages.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    let mut dirs: Vec<String> = std::fs::read_dir(&root)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    dirs.sort();
    let mut list: Vec<Language> = listed.into_iter().filter(|l| dirs.contains(&l.value)).collect();
    for d in dirs {
        if !list.iter().any(|l| l.value == d) {
            list.push(Language { name: language_name(&d), value: d });
        }
    }
    list
}

