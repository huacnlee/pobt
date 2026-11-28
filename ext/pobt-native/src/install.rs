//! Path of Building where there is none: its portable release from GitHub,
//! downloaded and unpacked where its own installer puts it; and the part of POB's
//! updates that replaces its runtime (its DLLs), which POB leaves to its
//! `Update.exe` and POBT applies before it loads them.

use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;

use crate::settings::Game;

/// Where POBT installs a game's Path of Building: where Path of Building's
/// own installer puts it (`%APPDATA%Path of Building Community`, and
/// `... (PoE2)`), so the two share it. Not beside POBT.exe: an update of
/// POBT replaces everything in its program's folder.
pub fn install_dir(game: Game) -> Option<PathBuf> {
    Some(install_root()?.join(folder(game)))
}

fn install_root() -> Option<PathBuf> {
    dirs::data_dir()
}

fn folder(game: Game) -> &'static str {
    match game {
        Game::Poe1 => "Path of Building Community",
        Game::Poe2 => "Path of Building Community (PoE2)",
    }
}

/// Moves the Path of Building an earlier POBT installed beside its
/// program to where Path of Building installs (unless one is there), before an update of POBT (or its install
/// script) removes it. An update moves the old entries of the program's
/// folder aside as `.nsh-updater-old-<pid>-<name>` and removes them at the
/// next update check: one found there is moved too.
pub fn rescue_beside_program() {
    let (Some(program), Some(data)) = (
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(Path::to_path_buf)),
        install_root(),
    ) else {
        return;
    };
    for game in [Game::Poe1, Game::Poe2] {
        if let Err(e) = rescue(&program, &data, game) {
            log::warn!("moving Path of Building out of {}: {e}", program.display());
        }
    }
}

fn rescue(program: &Path, data: &Path, game: Game) -> io::Result<Option<PathBuf>> {
    let to = data.join(folder(game));
    if to.exists() {
        return Ok(None);
    }
    // Any of the game's Path of Building there, whatever its folder's name; one an update moved aside last.
    let mut found: Vec<PathBuf> = fs::read_dir(program)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| crate::settings::is_pob_dir(p, game))
        .collect();
    let aside = |p: &PathBuf| {
        p.file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with(".nsh-updater-old-"))
    };
    found.sort_by_key(aside);
    let Some(from) = found.into_iter().next() else {
        return Ok(None);
    };
    fs::create_dir_all(data)?;
    fs::rename(&from, &to)?;
    log::info!("moved {} to {}", from.display(), to.display());
    Ok(Some(to))
}

fn release_url(game: Game) -> &'static str {
    match game {
        Game::Poe1 => {
            "https://github.com/PathOfBuildingCommunity/PathOfBuilding/releases/latest/download/PathOfBuildingCommunity-Portable.zip"
        }
        Game::Poe2 => {
            "https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/releases/latest/download/PathOfBuildingCommunity-PoE2-Portable.zip"
        }
    }
}

/// An install's progress, as the launcher shows it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Progress {
    /// "Poe1" or "Poe2".
    pub game: String,
    /// "downloading", "unpacking", "done" or "failed".
    pub phase: String,
    pub done: u64,
    pub total: u64,
    /// The folder once done; the error once failed.
    pub message: String,
}

static PROGRESS: Mutex<Option<Progress>> = Mutex::new(None);

fn set(f: impl FnOnce(&mut Progress)) {
    if let Some(p) = PROGRESS.lock().unwrap().as_mut() {
        f(p);
    }
}

/// The install running or last run, if any.
pub fn progress() -> Option<Progress> {
    PROGRESS.lock().unwrap().clone()
}

/// Installs `game`'s Path of Building in the background; `progress` follows
/// it. One install at a time.
pub fn start(game: Game) -> bool {
    {
        let mut p = PROGRESS.lock().unwrap();
        if p.as_ref()
            .is_some_and(|p| p.phase == "downloading" || p.phase == "unpacking")
        {
            return false;
        }
        *p = Some(Progress {
            game: format!("{game:?}"),
            phase: "downloading".into(),
            ..Default::default()
        });
    }
    std::thread::spawn(move || match install(game) {
        Ok(dir) => set(|p| {
            p.phase = "done".into();
            p.message = dir.display().to_string();
        }),
        Err(e) => {
            log::error!("installing Path of Building: {e}");
            set(|p| {
                p.phase = "failed".into();
                p.message = e;
            })
        }
    });
    true
}

fn install(game: Game) -> Result<PathBuf, String> {
    let dir = install_dir(game).ok_or("no local data folder")?;
    let parent = dir.parent().ok_or("no parent folder")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let archive = parent.join(format!(
        "{}.zip.part",
        dir.file_name().unwrap().to_string_lossy()
    ));
    download(&crate::settings::github_url(release_url(game)), &archive)?;

    set(|p| {
        p.phase = "unpacking".into();
        p.done = 0;
        p.total = 0;
    });
    // Unpack beside it, then put it in place: a failed unpack leaves no half install.
    let staging = parent.join(format!(
        "{}.new",
        dir.file_name().unwrap().to_string_lossy()
    ));
    let _ = fs::remove_dir_all(&staging);
    unpack(&archive, &staging)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    fs::rename(&staging, &dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let _ = fs::remove_file(&archive);
    Ok(dir)
}

fn download(url: &str, to: &Path) -> Result<(), String> {
    let response = ureq::get(url).call().map_err(|e| format!("{url}: {e}"))?;
    let total = response
        .header("content-length")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    set(|p| p.total = total);
    let mut reader = response.into_reader();
    let mut file = File::create(to).map_err(|e| format!("{}: {e}", to.display()))?;
    let mut buf = vec![0u8; 1 << 16];
    let mut done = 0u64;
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("downloading: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("{}: {e}", to.display()))?;
        done += n as u64;
        set(|p| p.done = done);
    }
    if total > 0 && done != total {
        return Err(format!("the download stopped at {done} of {total} bytes"));
    }
    Ok(())
}

fn unpack(archive: &Path, to: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| format!("{}: {e}", archive.display()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("{}: {e}", archive.display()))?;
    let count = zip.len() as u64;
    set(|p| p.total = count);
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name() else {
            continue;
        };
        let path = to.join(name);
        if entry.is_dir() {
            fs::create_dir_all(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        } else {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
            }
            let mut out = File::create(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            io::copy(&mut entry, &mut out).map_err(|e| format!("{}: {e}", path.display()))?;
        }
        set(|p| p.done = i as u64 + 1);
    }
    Ok(())
}

/// The runtime update POB downloaded and left for its `Update.exe`
/// (`Update/opFileRuntime.txt`), if there is one.
pub fn pending_runtime_update(pob_dir: &Path) -> Option<PathBuf> {
    Some(pob_dir.join("Update").join("opFileRuntime.txt")).filter(|p| p.is_file())
}

/// Applies a runtime update as POB's `UpdateApply.lua` would, before POB's
/// DLLs are loaded: its `move` and `delete` lines; not its `start`, which would
/// open POB's own program.
pub fn apply_runtime_update(pob_dir: &Path) -> Result<(), String> {
    let Some(ops) = pending_runtime_update(pob_dir) else {
        return Ok(());
    };
    let text = fs::read_to_string(&ops).map_err(|e| format!("{}: {e}", ops.display()))?;
    let _ = fs::remove_file(&ops);
    let at = |s: &str| {
        let p = Path::new(s);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            pob_dir.join(p)
        }
    };
    let quoted = |s: &str| {
        s.split('"')
            .filter(|s| !s.trim().is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>()
    };
    for line in text.lines() {
        let (op, args) = line.split_once(' ').unwrap_or((line, ""));
        match op {
            "move" => {
                let parts = quoted(args);
                let [src, dst] = parts.as_slice() else {
                    continue;
                };
                let (src, dst) = (at(src), at(&dst.replace("{space}", " ")));
                log::info!("updating {}", dst.display());
                if let Some(parent) = dst.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                fs::copy(&src, &dst).map_err(|e| format!("{}: {e}", dst.display()))?;
                let _ = fs::remove_file(&src);
            }
            "delete" => {
                if let Some(file) = quoted(args).first() {
                    let _ = fs::remove_file(at(file));
                }
            }
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pobt-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A Path of Building folder: what `is_pob_dir` looks for.
    fn pob(dir: &Path, game: Game) {
        fs::create_dir_all(dir).unwrap();
        for f in ["Launch.lua", "lua51.dll", game.exe()] {
            fs::write(dir.join(f), b"").unwrap();
        }
    }

    #[test]
    fn moves_path_of_building_out_of_the_program_folder() {
        let root = temp("rescue");
        let (program, data) = (root.join("POBT"), root.join("data"));
        pob(&program.join("Path of Building Community"), Game::Poe1);
        pob(
            &program.join(".nsh-updater-old-42-PathOfBuildingCommunity-PoE2"),
            Game::Poe2,
        );
        fs::create_dir_all(program.join("nsh")).unwrap();

        assert_eq!(
            rescue(&program, &data, Game::Poe1).unwrap(),
            Some(data.join("Path of Building Community"))
        );
        assert!(crate::settings::is_pob_dir(
            &data.join("Path of Building Community"),
            Game::Poe1
        ));
        assert!(!program.join("Path of Building Community").exists());
        // One an update moved aside, before it is removed.
        assert_eq!(
            rescue(&program, &data, Game::Poe2).unwrap(),
            Some(data.join("Path of Building Community (PoE2)"))
        );
        assert!(program.join("nsh").exists());
        // Nothing more to move, and one already in the data folder stays.
        pob(&program.join("PathOfBuildingCommunity"), Game::Poe1);
        assert_eq!(rescue(&program, &data, Game::Poe1).unwrap(), None);
        assert!(program.join("PathOfBuildingCommunity").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn applies_a_runtime_update() {
        let dir = temp("runtime");
        fs::create_dir_all(dir.join("Update")).unwrap();
        fs::write(dir.join("Update/new.dll"), b"new").unwrap();
        fs::write(dir.join("old.dll"), b"old").unwrap();
        fs::write(dir.join("gone.dll"), b"gone").unwrap();
        let ops = format!(
            "move \"Update/new.dll\" \"{}\"\ndelete \"{}\"\nstart \"{}\"\n",
            dir.join("lua51.dll").display(),
            dir.join("gone.dll").display(),
            dir.join("Path of Building.exe").display()
        );
        fs::write(dir.join("Update/opFileRuntime.txt"), ops).unwrap();
        assert!(pending_runtime_update(&dir).is_some());
        apply_runtime_update(&dir).unwrap();
        assert_eq!(fs::read(dir.join("lua51.dll")).unwrap(), b"new");
        assert!(!dir.join("gone.dll").exists());
        assert!(!dir.join("Update/new.dll").exists());
        assert!(pending_runtime_update(&dir).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    /// Downloads and unpacks Path of Building for Path of Exile 2 (some 360 MB):
    /// `cargo test --lib installs_poe2 -- --ignored`.
    #[test]
    #[ignore]
    fn installs_poe2() {
        let dir = temp("poe2");
        let archive = dir.join("pob.zip");
        download(release_url(Game::Poe2), &archive).unwrap();
        unpack(&archive, &dir.join("pob")).unwrap();
        assert!(crate::settings::is_pob_dir(&dir.join("pob"), Game::Poe2));
        let _ = fs::remove_dir_all(&dir);
    }
}
