//! The translation data: the `trs` folder beside the program (or in the
//! source tree when run from it), plain CSV files the user may edit; or, for a
//! language updated since this POBT was released, its newer copy in POBT's data
//! folder (`trs_update`).

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

use serde::Deserialize;

/// The `trs` folder beside the program, or up to a few folders above it (a
/// development run's program sits deep in the source tree), or in a macOS
/// bundle's `Contents/Resources`, if there is one.
pub fn root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .skip(1)
        .take(6)
        .flat_map(|d| [d.join("trs"), d.join("Resources").join("trs")])
        .find(|d| d.join("languages.json").is_file())
        .or_else(|| {
            // Tests run from cargo's target folder, wherever it is.
            let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../trs");
            (cfg!(test) && source.is_dir()).then_some(source)
        })
}

/// Where updated translations go: `trs` in POBT's data folder, beside its settings.
pub fn downloaded_root() -> Option<PathBuf> {
    Some(dirs::config_dir()?.join("pobt").join("trs"))
}

/// `version.json` of a `trs` folder: when each language's files last changed (Unix seconds of the commit), as the
/// release and the translation bundles write it. Empty when there is none (a development run's source tree).
pub fn versions(root: &Path) -> BTreeMap<String, i64> {
    std::fs::read(root.join("version.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// The `trs` folder to read `language` from: the bundled one, unless the data folder has a newer copy of the
/// language. A bundled folder with no `version.json` (the source tree) is always the one.
pub(crate) fn pick(bundled: Option<PathBuf>, downloaded: Option<PathBuf>, language: &str) -> Option<PathBuf> {
    let lang = language.split('/').next().unwrap_or(language);
    let downloaded = downloaded.filter(|d| d.join(lang).is_dir());
    let Some(bundled) = bundled else { return downloaded };
    let have = versions(&bundled);
    if have.is_empty() {
        return Some(bundled);
    }
    match downloaded {
        Some(d) if versions(&d).get(lang).copied().unwrap_or(0) > have.get(lang).copied().unwrap_or(0) => Some(d),
        _ => Some(bundled),
    }
}

/// The folder of `language` (or of a folder in it, `zh-rCN/tencent`) as read now.
pub fn dir(language: &str) -> Option<PathBuf> {
    pick(root(), downloaded_root(), language).map(|r| r.join(language))
}

/// The version of `language` as read now (`versions`); 0 when unknown.
pub fn version(language: &str) -> i64 {
    let lang = language.split('/').next().unwrap_or(language);
    pick(root(), downloaded_root(), lang).map(|r| versions(&r).get(lang).copied().unwrap_or(0)).unwrap_or(0)
}

/// The CSV files of `language`, sorted by name.
pub fn files(language: &str) -> Vec<(String, Vec<u8>)> {
    let Some(dir) = dir(language) else {
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

/// The CSV files of `language` and of its `tencent` folder as one number, which changes when one of them is edited,
/// added or removed: their names, sizes and times.
pub fn stamp(language: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let Some(dir) = dir(language) else { return 0 };
    let mut files: Vec<_> = [dir.clone(), dir.join("tencent")]
        .iter()
        .flat_map(|d| std::fs::read_dir(d).into_iter().flatten().flatten())
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("csv")))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((e.path(), meta.len(), meta.modified().ok()))
        })
        .collect();
    files.sort();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    files.hash(&mut hasher);
    hasher.finish()
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
/// then any other folder under its own name (a language only updates have brought too).
pub fn languages() -> Vec<Language> {
    let Some(root) = root().or_else(downloaded_root) else { return Vec::new() };
    let listed: Vec<Language> = std::fs::read(root.join("languages.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    let mut dirs: Vec<String> = [Some(root), downloaded_root()]
        .into_iter()
        .flatten()
        .flat_map(|r| std::fs::read_dir(r).into_iter().flatten().flatten())
        .filter(|e| e.path().is_dir() && !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    dirs.sort();
    dirs.dedup();
    let mut list: Vec<Language> = listed.into_iter().filter(|l| dirs.contains(&l.value)).collect();
    for d in dirs {
        if !list.iter().any(|l| l.value == d) {
            list.push(Language { name: language_name(&d), value: d });
        }
    }
    list
}

