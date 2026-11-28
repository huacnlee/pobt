//! Translations kept up to date without a new POBT: each language's files are published on their own, as
//! `trs-<language>.zip` on the `trs` release of POBT's repository, listed with when they last changed in `trs.json`
//! (`.github/workflows/trs.yml`, on every change to `trs/`). While POBT runs, the languages in use are compared with
//! it now and then, and a newer one is unpacked into the data folder (`trs::downloaded_root`), which `trs::dir` then
//! reads instead of the bundled one; `translate::watch` sees its files change and the screens show it at once.
//! A development run (its `trs` has no `version.json`) never updates.

use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::Deserialize;
use sha2::{Digest, Sha256};

const RELEASE: &str = "https://github.com/huacnlee/pobt/releases/download/trs";
/// How often a language is compared with the published one; sooner again after a failure.
const EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const RETRY: Duration = Duration::from_secs(30 * 60);
/// The rows the translation check added on this computer (`trfill`): carried into each update of the language.
const LOCAL: &[&str] = &["POBT-ai.csv"];

#[derive(Debug, Deserialize)]
struct Manifest {
    languages: HashMap<String, Entry>,
}

#[derive(Debug, Clone, Deserialize)]
struct Entry {
    /// When the language's files last changed (Unix seconds).
    date: i64,
    file: String,
    sha256: String,
}

/// Keeps the languages `in_use` gives up to date while the program runs: each is checked when first seen, then every
/// six hours. Call it once.
pub fn start(in_use: impl Fn() -> Vec<String> + Send + 'static) {
    std::thread::spawn(move || {
        let mut next: HashMap<String, Instant> = HashMap::new();
        loop {
            for language in in_use() {
                if next.get(&language).is_some_and(|t| Instant::now() < *t) {
                    continue;
                }
                let wait = match check(&language) {
                    Ok(true) => {
                        log::info!("translations {language}: updated to {}", crate::trs::version(&language));
                        EVERY
                    }
                    Ok(false) => EVERY,
                    Err(e) => {
                        log::warn!("translations {language}: no update: {e}");
                        RETRY
                    }
                };
                next.insert(language, Instant::now() + wait);
            }
            std::thread::sleep(Duration::from_secs(20));
        }
    });
}

static CHECKING: Mutex<()> = Mutex::new(());

/// Compares `language` with the published one and installs that if it is newer; whether it did.
pub fn check(language: &str) -> Result<bool, String> {
    let _one = CHECKING.lock().unwrap();
    let bundled = crate::trs::root();
    if bundled.as_deref().is_some_and(|b| crate::trs::versions(b).is_empty()) {
        return Ok(false);
    }
    let Some(root) = crate::trs::downloaded_root() else { return Ok(false) };
    let manifest: Manifest = get(&format!("{RELEASE}/trs.json"))
        .and_then(|b| serde_json::from_slice(&b).map_err(|e| format!("trs.json: {e}")))?;
    let Some(entry) = manifest.languages.get(language) else { return Ok(false) };
    if entry.date <= crate::trs::version(language) {
        return Ok(false);
    }
    let zip = get(&format!("{RELEASE}/{}", entry.file))?;
    let sum: String = Sha256::digest(&zip).iter().map(|b| format!("{b:02x}")).collect();
    if !sum.eq_ignore_ascii_case(&entry.sha256) {
        return Err(format!("{}: its SHA-256 is {sum}, not {}", entry.file, entry.sha256));
    }
    install(&root, language, entry.date, &zip, crate::trs::dir(language).as_deref())?;
    Ok(true)
}

fn get(url: &str) -> Result<Vec<u8>, String> {
    let response = ureq::get(url).timeout(Duration::from_secs(120)).call().map_err(|e| format!("{url}: {e}"))?;
    let mut out = Vec::new();
    response.into_reader().take(256 << 20).read_to_end(&mut out).map_err(|e| format!("{url}: {e}"))?;
    Ok(out)
}

/// Unpacks `zip` (a language's files) as `root/<language>`, dated `date` in `root/version.json`. The rows of this
/// computer's own (`LOCAL`) in `current`, the folder read until now, go on with any the update lacks. Unpacked
/// beside it first, so a failure leaves the folder as it was.
fn install(root: &Path, language: &str, date: i64, zip: &[u8], current: Option<&Path>) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| format!("{}: {e}", root.display()))?;
    let staging = root.join(format!(".{language}.new"));
    let _ = fs::remove_dir_all(&staging);
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).map_err(|e| format!("{language}: {e}"))?;
    archive.extract(&staging).map_err(|e| format!("{}: {e}", staging.display()))?;
    if fs::read_dir(&staging).map(|d| d.count()).unwrap_or(0) == 0 {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("{language}: the update has no files"));
    }
    if let Some(current) = current {
        for name in LOCAL {
            carry(&current.join(name), &staging.join(name)).map_err(|e| format!("{name}: {e}"))?;
        }
    }
    let dir = root.join(language);
    let aside = root.join(format!(".{language}.old"));
    let _ = fs::remove_dir_all(&aside);
    if dir.exists() {
        fs::rename(&dir, &aside).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    if let Err(e) = fs::rename(&staging, &dir) {
        let _ = fs::rename(&aside, &dir);
        return Err(format!("{}: {e}", dir.display()));
    }
    let _ = fs::remove_dir_all(&aside);
    let mut versions = crate::trs::versions(root);
    versions.insert(language.to_string(), date);
    let json = serde_json::to_vec_pretty(&versions).map_err(|e| e.to_string())?;
    fs::write(root.join("version.json"), json).map_err(|e| format!("version.json: {e}"))
}

/// The lines of `from` that `to` does not have, added to it.
fn carry(from: &Path, to: &Path) -> std::io::Result<()> {
    let Ok(mine) = fs::read_to_string(from) else { return Ok(()) };
    let theirs = fs::read_to_string(to).unwrap_or_default();
    let known: std::collections::HashSet<&str> = theirs.lines().collect();
    let missing: Vec<&str> = mine.lines().filter(|l| !l.trim().is_empty() && !known.contains(l)).collect();
    if missing.is_empty() {
        return Ok(());
    }
    let mut out = theirs.clone();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    for l in missing {
        out.push_str(l);
        out.push('\n');
    }
    fs::write(to, out)
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("pobt-trs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
        let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, text) in files {
            out.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(text.as_bytes()).unwrap();
        }
        out.finish().unwrap().into_inner()
    }

    #[test]
    fn installs_a_newer_language_over_the_bundled_one() {
        let base = temp("install");
        let (bundled, downloaded) = (base.join("bundled"), base.join("downloaded"));
        fs::create_dir_all(bundled.join("zh-rCN")).unwrap();
        fs::write(bundled.join("version.json"), r#"{"zh-rCN": 100}"#).unwrap();
        fs::write(bundled.join("zh-rCN/POBT.csv"), "Life,生命\n").unwrap();
        fs::write(bundled.join("zh-rCN/POBT-ai.csv"), "\"Mana\",\"魔力\"\n").unwrap();
        assert_eq!(crate::trs::pick(Some(bundled.clone()), Some(downloaded.clone()), "zh-rCN"), Some(bundled.clone()));

        let zip = zip_of(&[("POBT.csv", "Life,生命\nArmour,护甲\n"), ("tencent/game.csv", "Ring,戒指\n")]);
        install(&downloaded, "zh-rCN", 200, &zip, Some(&bundled.join("zh-rCN"))).unwrap();
        assert_eq!(crate::trs::versions(&downloaded).get("zh-rCN"), Some(&200));
        assert_eq!(fs::read_to_string(downloaded.join("zh-rCN/tencent/game.csv")).unwrap(), "Ring,戒指\n");
        // The rows the translation check added here go on.
        assert_eq!(fs::read_to_string(downloaded.join("zh-rCN/POBT-ai.csv")).unwrap(), "\"Mana\",\"魔力\"\n");
        assert_eq!(crate::trs::pick(Some(bundled.clone()), Some(downloaded.clone()), "zh-rCN/tencent"), Some(downloaded.clone()));

        // A POBT released after it brings newer files of its own: those are read again.
        fs::write(bundled.join("version.json"), r#"{"zh-rCN": 300}"#).unwrap();
        assert_eq!(crate::trs::pick(Some(bundled.clone()), Some(downloaded.clone()), "zh-rCN"), Some(bundled.clone()));

        // Another update replaces the folder whole: a file it no longer has goes.
        let zip = zip_of(&[("POBT.csv", "Life,生命\n")]);
        install(&downloaded, "zh-rCN", 400, &zip, Some(&downloaded.join("zh-rCN"))).unwrap();
        assert!(!downloaded.join("zh-rCN/tencent").exists());
        assert!(downloaded.join("zh-rCN/POBT-ai.csv").is_file());
        assert!(!downloaded.join(".zh-rCN.new").exists() && !downloaded.join(".zh-rCN.old").exists());
        let _ = fs::remove_dir_all(&base);
    }

    /// `trs.json` as scripts/trs-bundle.mjs writes it; POBT_TEST_TRS: a folder it wrote, whose bundles are checked
    /// against it and installed.
    #[test]
    fn reads_the_published_list() {
        let json = r#"{"commit": "40aada7", "languages": {"zh-rCN": {"date": 1795834175, "file": "trs-zh-rcn.zip",
            "size": 2012390, "sha256": "09c8"}}}"#;
        let m: Manifest = serde_json::from_str(json).unwrap();
        assert_eq!(m.languages["zh-rCN"].date, 1795834175);
        let Some(dir) = std::env::var_os("POBT_TEST_TRS").map(std::path::PathBuf::from) else { return };
        let m: Manifest = serde_json::from_slice(&fs::read(dir.join("trs.json")).unwrap()).unwrap();
        let root = temp("published");
        for (language, entry) in &m.languages {
            let zip = fs::read(dir.join(&entry.file)).unwrap();
            let sum: String = Sha256::digest(&zip).iter().map(|b| format!("{b:02x}")).collect();
            assert_eq!(sum, entry.sha256);
            install(&root, language, entry.date, &zip, None).unwrap();
            assert!(fs::read_dir(root.join(language)).unwrap().count() > 3, "{language}");
        }
        assert!(root.join("zh-rCN/tencent/game.csv").is_file());
        let rows: usize = fs::read_dir(root.join("zh-rCN")).unwrap().flatten().filter_map(|e| fs::read_to_string(e.path()).ok()).map(|t| t.lines().count()).sum();
        assert!(rows > 10000, "{rows} rows");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_source_tree_is_never_updated() {
        let base = temp("source");
        let (bundled, downloaded) = (base.join("bundled"), base.join("downloaded"));
        fs::create_dir_all(bundled.join("zh-rCN")).unwrap();
        fs::create_dir_all(downloaded.join("zh-rCN")).unwrap();
        fs::write(downloaded.join("version.json"), r#"{"zh-rCN": 999}"#).unwrap();
        assert_eq!(crate::trs::pick(Some(bundled.clone()), Some(downloaded), "zh-rCN"), Some(bundled));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_broken_update_leaves_the_folder() {
        let base = temp("broken");
        fs::create_dir_all(base.join("zh-rCN")).unwrap();
        fs::write(base.join("zh-rCN/POBT.csv"), "Life,生命\n").unwrap();
        assert!(install(&base, "zh-rCN", 5, b"not a zip", None).is_err());
        assert_eq!(fs::read_to_string(base.join("zh-rCN/POBT.csv")).unwrap(), "Life,生命\n");
        let _ = fs::remove_dir_all(&base);
    }
}
