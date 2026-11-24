//! The pictures of items and gems on POBT's build screens. Path of Building ships none, so, as go-pob does, each name
//! leads to the game's art (`Art/2DItems/...`) by RePoE's export of the game data (base items and uniques, made again
//! for each patch by its maintainers), and the picture is the official site's (`web.poecdn.com`). Nothing here
//! changes with a league: the lists are downloaded and kept for a week.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime};

/// Names to art paths, for one game.
#[derive(Default)]
pub struct Index {
    /// A unique's name (and a base's, a gem's, which are base items too) to its art.
    uniques: HashMap<String, String>,
    bases: HashMap<String, String>,
}

static INDEX: RwLock<[Option<Arc<Index>>; 2]> = RwLock::new([None, None]);

const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);
const CDN: &str = "https://web.poecdn.com/image/";

fn source(poe2: bool) -> &'static str {
    if poe2 { "https://repoe-fork.github.io/poe2/" } else { "https://repoe-fork.github.io/" }
}

fn cache_file(poe2: bool, name: &str) -> PathBuf {
    let dir = crate::images::cache_dir().join("art");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(format!("{}-{name}", if poe2 { "poe2" } else { "poe1" }))
}

/// The list `name` (`base_items.json`), from the cache while it is fresh, else downloaded (the stale copy when that
/// fails, offline).
fn list(poe2: bool, name: &str) -> Option<serde_json::Value> {
    let file = cache_file(poe2, name);
    let fresh = std::fs::metadata(&file)
        .and_then(|m| m.modified())
        .is_ok_and(|t| SystemTime::now().duration_since(t).unwrap_or_default() < MAX_AGE);
    if !fresh {
        let got = ureq::get(&format!("{}{name}", source(poe2)))
            .timeout(Duration::from_secs(60))
            .call()
            .ok()
            .and_then(|r| {
                let mut s = String::new();
                std::io::Read::read_to_string(&mut r.into_reader(), &mut s).ok().map(|_| s)
            });
        if let Some(text) = got.filter(|t| serde_json::from_str::<serde_json::Value>(t).is_ok()) {
            let _ = std::fs::write(&file, text);
        }
    }
    serde_json::from_slice(&std::fs::read(&file).ok()?).ok()
}

/// `Art/2DItems/Belts/Belt3.dds` → `Art/2DItems/Belts/Belt3`.
fn art_of(v: &serde_json::Value) -> Option<String> {
    let dds = v.get("visual_identity")?.get("dds_file")?.as_str()?;
    Some(dds.strip_suffix(".dds").unwrap_or(dds).to_owned())
}

fn build(poe2: bool) -> Index {
    let mut index = Index::default();
    if let Some(serde_json::Value::Object(bases)) = list(poe2, "base_items.json") {
        for (_, b) in bases {
            if let (Some(name), Some(art)) = (b.get("name").and_then(|n| n.as_str()), art_of(&b)) {
                // The first of a name: a gem and a weapon can share one, and the weapon is listed in its own class
                index.bases.entry(name.to_owned()).or_insert(art);
            }
        }
    }
    if let Some(serde_json::Value::Object(uniques)) = list(poe2, "uniques.json") {
        for (_, u) in uniques {
            let alternate = u.get("is_alternate_art").and_then(|a| a.as_bool()).unwrap_or(false);
            if let (Some(name), Some(art), false) = (u.get("name").and_then(|n| n.as_str()), art_of(&u), alternate) {
                index.uniques.entry(name.to_owned()).or_insert(art);
            }
        }
    }
    index
}

/// Loads the names of `game` (`poe2` or not), once; whether there are any (none offline with nothing cached).
pub fn load(poe2: bool) -> bool {
    let slot = poe2 as usize;
    if let Some(i) = &INDEX.read().unwrap()[slot] {
        return !i.bases.is_empty();
    }
    let index = Arc::new(build(poe2));
    let any = !index.bases.is_empty();
    INDEX.write().unwrap()[slot] = Some(index);
    any
}

/// The picture of an item or a gem: `name` (a unique's or a gem's), `base` (the item's base type, "" for a gem),
/// `unique` (a unique or relic, which has art of its own); "" when there is none.
pub fn url(poe2: bool, name: &str, base: &str, unique: bool) -> String {
    let Some(index) = INDEX.read().unwrap()[poe2 as usize].clone() else { return String::new() };
    let art = (unique.then(|| index.uniques.get(name)).flatten())
        .or_else(|| (!base.is_empty()).then(|| index.bases.get(base)).flatten())
        .or_else(|| {
            // a gem: by its name, a support's with "Support" after it as POB may leave out
            base.is_empty().then(|| index.bases.get(name).or_else(|| index.bases.get(&format!("{name} Support")))).flatten()
        });
    art.map(|a| format!("{CDN}{a}.png")).unwrap_or_default()
}

/// The picture at `url` (one of [`url`]'s), downloaded once into the cache, as a file the screens can show. Some art
/// holds frames side by side, three of the item's size: an active gem's (the skill's icon, then the gem: the gem is
/// kept, as a support gem's picture is the gem alone) and a flask's (its glass, the glass dimmed, its liquid: drawn as
/// the game does, the liquid behind the glass).
pub fn picture(url: &str) -> Option<PathBuf> {
    // One download of a picture at a time: the screens ask for one from several places at once (a slot's row, the
    // list of items, a drop-down); the others wait for it.
    static PENDING: std::sync::Mutex<Option<HashMap<String, Arc<std::sync::OnceLock<Option<PathBuf>>>>>> =
        std::sync::Mutex::new(None);
    let cell = PENDING.lock().unwrap().get_or_insert_with(HashMap::new).entry(url.to_owned()).or_default().clone();
    let got = cell.get_or_init(|| fetch(url)).clone();
    if got.is_none() {
        // Asked again later (offline, say), it is tried again.
        PENDING.lock().unwrap().as_mut().map(|m| m.remove(url));
    }
    got
}

fn fetch(url: &str) -> Option<PathBuf> {
    use sha2::{Digest, Sha256};
    let key: String = Sha256::digest(format!("v3:{url}").as_bytes()).iter().take(12).map(|b| format!("{b:02x}")).collect();
    let dir = crate::images::cache_dir().join("art").join("pictures");
    let file = dir.join(format!("{key}.png"));
    if file.exists() {
        return Some(file);
    }
    let resp = ureq::get(url).timeout(Duration::from_secs(30)).call().ok()?;
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut resp.into_reader(), &mut bytes).ok()?;
    let img = image::load_from_memory(&bytes).ok()?;
    let img = framed(url, img);
    std::fs::create_dir_all(&dir).ok()?;
    // Written whole under another name first, so a picture is never read half written.
    // Its own name, as another POBT may write the same picture.
    let part = dir.join(format!("{key}.{}.part", std::process::id()));
    img.save_with_format(&part, image::ImageFormat::Png).ok()?;
    if std::fs::rename(&part, &file).is_err() {
        let _ = std::fs::remove_file(&part);
    }
    file.exists().then_some(file)
}

/// One picture out of art holding three frames side by side (see [`picture`]); other art as it is.
fn framed(url: &str, img: image::DynamicImage) -> image::DynamicImage {
    let (w, h) = (img.width(), img.height());
    let flask = url.contains("/Flasks/");
    let gem = url.contains("/Gems/");
    // A strip of three frames: a gem's square ones, a flask's twice as tall as wide. A single picture (a support gem's,
    // whose width may still divide by 3) stays whole.
    let fw = w / 3;
    let strip = w >= 3 && w % 3 == 0 && if gem { fw == h } else { flask && fw * 2 == h };
    if !strip {
        return img;
    }
    let last = img.crop_imm(2 * fw, 0, fw, h);
    if !flask {
        return last;
    }
    let mut out = last.to_rgba8();
    image::imageops::overlay(&mut out, &img.crop_imm(0, 0, fw, h).to_rgba8(), 0, 0);
    image::DynamicImage::ImageRgba8(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Downloads RePoE's lists: run with POBT_NET_TESTS set.
    #[test]
    fn names_lead_to_art() {
        if std::env::var_os("POBT_NET_TESTS").is_none() {
            eprintln!("POBT_NET_TESTS not set: skipped");
            return;
        }
        assert!(load(false));
        assert_eq!(url(false, "Headhunter", "Leather Belt", true), format!("{CDN}Art/2DItems/Belts/Headhunter.png"));
        assert_eq!(url(false, "Doom Grip", "Leather Belt", false), format!("{CDN}Art/2DItems/Belts/Belt3.png"));
        assert_eq!(url(false, "Headhunter", "Leather Belt", false), format!("{CDN}Art/2DItems/Belts/Belt3.png"));
        assert_eq!(url(false, "Fireball", "", false), format!("{CDN}Art/2DItems/Gems/Fireball.png"));
        assert_eq!(url(false, "Added Fire Damage", "", false), format!("{CDN}Art/2DItems/Gems/Support/AddedFireDamage.png"));
        assert_eq!(url(false, "No Such Thing", "", false), "");
        // An active gem's frames side by side: the gem is kept, square.
        let file = picture(&format!("{CDN}Art/2DItems/Gems/Despair.png")).expect("Despair's picture");
        let img = image::open(file).unwrap();
        assert_eq!(img.width(), img.height());
        // A support gem's single picture stays whole (its width divides by 3 too).
        let support = url(false, "Enlighten Support", "", false);
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut ureq::get(&support).call().unwrap().into_reader(), &mut bytes).unwrap();
        let raw = image::load_from_memory(&bytes).unwrap();
        let img = image::open(picture(&support).expect("a support's picture")).unwrap();
        assert_eq!((img.width(), img.height()), (raw.width(), raw.height()), "{support}");
        // A flask's: one flask, its liquid behind its glass.
        let flask = url(false, "Ruby Flask", "Ruby Flask", false);
        let img = image::open(picture(&flask).expect("a flask's picture")).unwrap();
        assert!(img.height() > img.width(), "{}x{}", img.width(), img.height());
        // Asked for from several places at once, the first time: every one gets it.
        let ring = url(false, "Paua Ring", "Paua Ring", false);
        let threads: Vec<_> = (0..6).map(|_| { let r = ring.clone(); std::thread::spawn(move || picture(&r).is_some()) }).collect();
        assert!(threads.into_iter().all(|t| t.join().unwrap()));
    }
}
