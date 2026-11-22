//! How many steps (modules) each Path of Building takes to load, kept from its
//! last start, so the next one shows how far along it is.

use std::{collections::HashMap, path::Path};

fn file() -> Option<std::path::PathBuf> {
    Some(dirs::data_dir()?.join("pobt").join("loading.json"))
}

fn all() -> HashMap<String, u32> {
    file()
        .and_then(|f| std::fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// The steps the POB in `dir` took last time, if it has loaded before.
pub fn expected(dir: &Path) -> Option<u32> {
    all().get(&dir.display().to_string()).copied()
}

/// Notes the steps the POB in `dir` took this time.
pub fn remember(dir: &Path, steps: u32) {
    let Some(file) = file() else { return };
    let mut map = all();
    map.insert(dir.display().to_string(), steps);
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(file, serde_json::to_vec(&map).unwrap_or_default());
}
