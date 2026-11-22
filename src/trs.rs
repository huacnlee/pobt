//! The translation data: built into the app (`trs_files.rs`), or a `trs`
//! directory beside the program, which takes precedence so translations
//! can be updated without a new release.

use std::{borrow::Cow, path::PathBuf};

use serde::Deserialize;

#[path = "trs_files.rs"]
mod embedded;

/// A `trs` directory beside the program (or in the source tree when run
/// from it), if there is one.
pub fn external_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors()
        .skip(1)
        .take(5)
        .map(|d| d.join("trs"))
        .find(|d| d.join("languages.json").is_file())
}

fn embedded(path: &str) -> Option<&'static [u8]> {
    embedded::FILES.iter().find(|(p, _)| *p == path).map(|(_, b)| *b)
}

/// The CSV files of `language`, sorted by name.
pub fn files(language: &str) -> Vec<(String, Cow<'static, [u8]>)> {
    if let Some(root) = external_root() {
        let dir = root.join(language);
        if dir.is_dir() {
            let mut out: Vec<_> = std::fs::read_dir(&dir)
                .into_iter()
                .flatten()
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("csv")))
                .filter_map(|p| {
                    let name = p.file_name()?.to_string_lossy().into_owned();
                    Some((name, Cow::Owned(std::fs::read(&p).ok()?)))
                })
                .collect();
            out.sort_by(|a, b| a.0.cmp(&b.0));
            return out;
        }
    }
    let prefix = format!("{language}/");
    embedded::FILES
        .iter()
        .filter_map(|(p, b)| Some((p.strip_prefix(&prefix)?.to_string(), Cow::Borrowed(*b))))
        .filter(|(n, _)| n.ends_with(".csv"))
        .collect()
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
/// then any other directory under its own name.
pub fn languages() -> Vec<Language> {
    let (listed, dirs): (Vec<Language>, Vec<String>) = match external_root() {
        Some(root) => (
            std::fs::read(root.join("languages.json"))
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default(),
            std::fs::read_dir(&root)
                .into_iter()
                .flatten()
                .flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect(),
        ),
        None => (
            embedded("languages.json").and_then(|b| serde_json::from_slice(b).ok()).unwrap_or_default(),
            embedded::FILES.iter().filter_map(|(p, _)| Some(p.split_once('/')?.0.to_string())).collect(),
        ),
    };
    let mut dirs: Vec<String> = dirs;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// `trs_files.rs` lists every file under `trs/`: run
    /// `scripts/gen-trs.sh` after changing them.
    #[test]
    fn embedded_list_is_current() {
        fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
            for e in std::fs::read_dir(dir).unwrap().flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(&p, base, out);
                } else if p.extension().is_some_and(|e| e == "csv" || e == "json") {
                    out.push(p.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/"));
                }
            }
        }
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("trs");
        let mut on_disk = Vec::new();
        walk(&root, &root, &mut on_disk);
        on_disk.sort();
        let mut listed: Vec<String> = embedded::FILES.iter().map(|(p, _)| p.to_string()).collect();
        listed.sort();
        assert_eq!(on_disk, listed, "run scripts/gen-trs.sh");
    }
}
