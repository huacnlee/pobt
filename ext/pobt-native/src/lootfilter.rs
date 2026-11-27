//! The smart loot filter's two jobs outside the page: getting poe.ninja's price pages, and writing the `.filter`
//! where Path of Exile reads item filters from. The filter itself is made in TSX (market/src/filter.ts).

use std::path::{Path, PathBuf};

/// poe.ninja asks callers to say who they are.
const USER_AGENT: &str = concat!("pobt/", env!("CARGO_PKG_VERSION"), " (+https://github.com/huacnlee/pobt)");

/// The file POBT writes; the game lists it by this name in its options.
pub const FILE_NAME: &str = "POBT.filter";

/// Only poe.ninja's API is fetched: the page builds the URLs, this keeps it to them.
pub fn fetch(url: &str) -> Result<String, String> {
    if !url.starts_with("https://poe.ninja/poe1/api/") {
        return Err(format!("{url}: not a poe.ninja price page"));
    }
    let response = ureq::get(url)
        .set("user-agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("HTTP {code}"),
            e => e.to_string(),
        })?;
    response.into_string().map_err(|e| e.to_string())
}

/// The folders the game may read filters from, likeliest first: the game's own folder under Documents (on Linux, also
/// inside Steam's Proton prefix, where the Windows game keeps it).
fn candidates(home: Option<&Path>, documents: Option<&Path>) -> Vec<PathBuf> {
    let game = Path::new("My Games").join("Path of Exile");
    let mut dirs = Vec::new();
    if cfg!(target_os = "linux") {
        if let Some(home) = home {
            for steam in [".local/share/Steam", ".steam/steam", ".var/app/com.valvesoftware.Steam/.local/share/Steam"] {
                dirs.push(
                    home.join(steam)
                        .join("steamapps/compatdata/238960/pfx/drive_c/users/steamuser/Documents")
                        .join(&game),
                );
            }
        }
    }
    if let Some(documents) = documents {
        dirs.push(documents.join(&game));
    }
    dirs
}

/// Where to write the filter: the first folder that exists, else the game's folder under Documents.
pub fn filter_dir() -> Option<PathBuf> {
    let home = dirs::home_dir();
    let documents = dirs::document_dir().or_else(|| home.as_ref().map(|h| h.join("Documents")));
    let list = candidates(home.as_deref(), documents.as_deref());
    list.iter().find(|d| d.is_dir()).cloned().or_else(|| list.last().cloned())
}

/// Writes `text` as POBT.filter in `dir` (made if missing), through a temporary file so the game never reads half.
pub fn write_in(dir: &Path, text: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let path = dir.join(FILE_NAME);
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    std::fs::write(&tmp, text).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetches_only_poe_ninja() {
        assert!(fetch("https://example.com/poe1/api/x").unwrap_err().contains("not a poe.ninja"));
    }

    #[test]
    fn documents_folder_comes_last() {
        let list = candidates(Some(Path::new("/h")), Some(Path::new("/h/Documents")));
        assert_eq!(list.last().unwrap(), &Path::new("/h/Documents").join("My Games").join("Path of Exile"));
    }

    #[test]
    fn writes_the_filter_whole() {
        let dir = std::env::temp_dir().join(format!("pobt-filter-{}", std::process::id())).join("My Games");
        let path = write_in(&dir, "Show\n").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "Show\n");
        assert!(!dir.join("POBT.filter.tmp").exists());
        std::fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }
}
