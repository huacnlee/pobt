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

/// Where the latest translations are published: `trs.json` (`{ "hash": … }`,
/// the git tree of `trs/`) and `trs.zip`, on the `trs` release.
const LATEST: &str = "https://github.com/huacnlee/pobt/releases/download/trs";

/// Brings the `trs` folder beside the program up to the latest published, in
/// the background: it takes effect the next time Path of Building starts. Not
/// in a development run, whose `trs` is the source tree's.
pub fn update_in_background() {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(|| match update() {
        Ok(true) => log::info!("translations updated"),
        Ok(false) => {}
        Err(e) => log::warn!("updating translations: {e}"),
    });
}

fn update() -> Result<bool, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    update_in(exe.parent().ok_or("no program folder")?)
}

/// Brings `dir`/trs up to the latest; true when it changed.
fn update_in(dir: &std::path::Path) -> Result<bool, String> {
    let trs = dir.join("trs");
    let latest: serde_json::Value = ureq::get(&format!("{LATEST}/trs.json"))
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .ok_or("trs.json is not JSON")?;
    let hash = latest["hash"].as_str().ok_or("trs.json has no hash")?;
    let ours = std::fs::read_to_string(trs.join(".hash")).unwrap_or_default();
    if ours.trim() == hash {
        return Ok(false);
    }

    let mut zip = Vec::new();
    std::io::Read::read_to_end(
        &mut ureq::get(&format!("{LATEST}/trs.zip")).call().map_err(|e| e.to_string())?.into_reader(),
        &mut zip,
    )
    .map_err(|e| e.to_string())?;
    // Unpacked beside it, then swapped in: a failed download or unpack leaves the old one.
    let staging = dir.join("trs.new");
    let _ = std::fs::remove_dir_all(&staging);
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).map_err(|e| e.to_string())?;
    archive.extract(&staging).map_err(|e| e.to_string())?;
    if !staging.join("languages.json").is_file() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("trs.zip has no languages.json".into());
    }
    std::fs::write(staging.join(".hash"), hash).map_err(|e| e.to_string())?;
    let old = dir.join("trs.old");
    let _ = std::fs::remove_dir_all(&old);
    if trs.exists() {
        std::fs::rename(&trs, &old).map_err(|e| format!("{}: {e}", trs.display()))?;
    }
    std::fs::rename(&staging, &trs).map_err(|e| format!("{}: {e}", trs.display()))?;
    let _ = std::fs::remove_dir_all(&old);
    Ok(true)
}

#[cfg(test)]
mod tests {
    /// Fetches the published translations into a new folder, then finds them current:
    /// `cargo test --lib fetches_translations -- --ignored`.
    #[test]
    #[ignore]
    fn fetches_translations() {
        let dir = std::env::temp_dir().join(format!("pobt-trs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(super::update_in(&dir), Ok(true));
        assert!(dir.join("trs/languages.json").is_file());
        assert!(dir.join("trs/zh-rCN").is_dir());
        assert_eq!(super::update_in(&dir), Ok(false));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
