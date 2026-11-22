//! Image handles. The canvas loads images by path, so every image POB draws
//! is a file: POB's own PNG/JPG/WebP files as they are, and the images made
//! here (art slices, tinted copies, decoded DDS) in the cache directory.
//!
//! SimpleGraphic multiplies images by the draw colour; a canvas cannot, so
//! a tinted copy is made in the background the first time a colour is used,
//! and the plain image is drawn until it is ready.

use std::{
    collections::{HashMap, HashSet},
    hash::{DefaultHasher, Hash, Hasher},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, mpsc},
};

use image::{RgbaImage, imageops};

pub struct ImageInfo {
    /// The file the canvas draws; `None` while it is not ready or failed.
    pub uri: Option<Arc<str>>,
    /// The file the pixels come from (for tinting).
    pub file: Option<PathBuf>,
    pub width: u32,
    pub height: u32,
    /// The images of a texture array's layers after the first.
    pub layers: Vec<u32>,
}

#[derive(Default)]
struct Registry {
    images: Vec<ImageInfo>,
    arts: Vec<Option<Arc<RgbaImage>>>,
    tints: HashMap<(u32, u32), Arc<str>>,
    pending: HashSet<(u32, u32)>,
}

static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
static WORKER: OnceLock<Mutex<mpsc::Sender<Job>>> = OnceLock::new();

fn registry() -> std::sync::MutexGuard<'static, Registry> {
    REGISTRY.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner())
}

pub fn cache_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let dir = base.join("pobt").join("cache");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// The canvas's URI of a file: its absolute path, with forward slashes.
pub fn uri_of(path: &Path) -> Arc<str> {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().map(|d| d.join(path)).unwrap_or_else(|_| path.to_path_buf())
    };
    Arc::from(abs.to_string_lossy().replace('\\', "/").as_str())
}

fn hash_of(parts: impl Hash) -> u64 {
    let mut h = DefaultHasher::new();
    parts.hash(&mut h);
    h.finish()
}

fn canvas_loads(path: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif")
}

/// Decodes any image POB uses into RGBA.
pub fn decode(path: &Path) -> Option<RgbaImage> {
    let name = path.to_string_lossy().to_ascii_lowercase();
    if name.ends_with(".zst") || name.ends_with(".dds") {
        return crate::dds::decode(path);
    }
    image::open(path).ok().map(|i| i.to_rgba8())
}

fn push(reg: &mut Registry, info: ImageInfo) -> u32 {
    reg.images.push(info);
    reg.images.len() as u32
}

fn file_info(file: PathBuf, w: u32, h: u32) -> ImageInfo {
    ImageInfo { uri: Some(uri_of(&file)), file: Some(file), width: w, height: h, layers: Vec::new() }
}

/// Converts a file the canvas cannot load into PNGs in the cache, one per
/// array layer, keyed by the file and its time.
fn convert(path: &Path) -> Vec<(PathBuf, u32, u32)> {
    let stamp = std::fs::metadata(path).and_then(|m| m.modified()).ok();
    let key = hash_of((path, stamp));
    let out = |layer: usize| cache_dir().join(format!("conv-{key:016x}-{layer}.png"));
    let index = cache_dir().join(format!("conv-{key:016x}.layers"));
    if let Some(count) = std::fs::read_to_string(&index).ok().and_then(|s| s.trim().parse::<usize>().ok()) {
        let cached: Vec<_> = (0..count)
            .filter_map(|l| image::image_dimensions(out(l)).ok().map(|(w, h)| (out(l), w, h)))
            .collect();
        if cached.len() == count {
            return cached;
        }
    }
    let layers = if path.to_string_lossy().to_ascii_lowercase().contains(".dds") {
        crate::dds::decode_layers(path).unwrap_or_default()
    } else {
        decode(path).into_iter().collect()
    };
    let mut result = Vec::new();
    for (l, img) in layers.iter().enumerate() {
        if img.save(out(l)).is_ok() {
            result.push((out(l), img.width(), img.height()));
        }
    }
    let _ = std::fs::write(&index, result.len().to_string());
    result
}

/// `imgHandle:Load`: the handle id (1-based), its size (0 if missing) and
/// its number of array layers.
pub fn load(path: &Path) -> (u32, u32, u32, u32) {
    let files = if canvas_loads(path) {
        match image::image_dimensions(path) {
            Ok((w, h)) => vec![(path.to_path_buf(), w, h)],
            Err(_) => Vec::new(),
        }
    } else {
        convert(path)
    };
    let mut reg = registry();
    let Some((first, w, h)) = files.first().cloned() else {
        let id = push(&mut reg, ImageInfo { uri: None, file: None, width: 0, height: 0, layers: Vec::new() });
        return (id, 0, 0, 1);
    };
    let layers: Vec<u32> = files[1..].iter().map(|(f, w, h)| push(&mut reg, file_info(f.clone(), *w, *h))).collect();
    let count = layers.len() as u32 + 1;
    let mut info = file_info(first, w, h);
    info.layers = layers;
    let id = push(&mut reg, info);
    (id, w, h, count)
}

/// `NewArtHandle`: CPU-side pixels to slice images from.
pub fn art_load(path: &Path) -> Option<(u32, u32, u32)> {
    let img = decode(path)?;
    let (w, h) = img.dimensions();
    let mut reg = registry();
    reg.arts.push(Some(Arc::new(img)));
    Some((reg.arts.len() as u32, w, h))
}

fn art(id: u32) -> Option<Arc<RgbaImage>> {
    registry().arts.get(id.checked_sub(1)? as usize).cloned().flatten()
}

fn save_generated(key: u64, make: impl FnOnce() -> RgbaImage) -> (u32, u32, u32) {
    let out = cache_dir().join(format!("art-{key:016x}.png"));
    let (w, h) = match image::image_dimensions(&out) {
        Ok(d) => d,
        Err(_) => {
            let img = make();
            let _ = img.save(&out);
            img.dimensions()
        }
    };
    let mut reg = registry();
    let id = push(&mut reg, file_info(out, w, h));
    (id, w, h)
}

/// `imgHandle:LoadArtRectangle`.
pub fn art_rect(art_id: u32, x1: i64, y1: i64, x2: i64, y2: i64) -> Option<(u32, u32, u32)> {
    let src = art(art_id)?;
    let (x1, x2) = (x1.min(x2).max(0) as u32, x1.max(x2).max(0) as u32);
    let (y1, y2) = (y1.min(y2).max(0) as u32, y1.max(y2).max(0) as u32);
    let key = hash_of(("rect", Arc::as_ptr(&src) as usize, src.dimensions(), x1, y1, x2, y2, src.as_raw().len()));
    let key = key ^ hash_of(&src.as_raw()[..src.as_raw().len().min(4096)]);
    Some(save_generated(key, || imageops::crop_imm(src.as_ref(), x1, y1, x2 - x1, y2 - y1).to_image()))
}

/// `imgHandle:LoadArtArcBand`: the quarter ring between two radii, above and
/// left of the centre, as SimpleGraphic cuts it.
pub fn art_arc(art_id: u32, xc: i64, yc: i64, rmin: i64, rmax: i64) -> Option<(u32, u32, u32)> {
    let src = art(art_id)?;
    let (rmin, rmax) = (rmin.min(rmax), rmin.max(rmax));
    let (x1, y1) = (xc - rmax, yc - rmax);
    if x1 < 0 || y1 < 0 {
        return None;
    }
    let (w, h) = ((xc - x1) as u32, (yc - y1) as u32);
    let key = hash_of(("arc", src.dimensions(), xc, yc, rmin, rmax)) ^ hash_of(&src.as_raw()[..src.as_raw().len().min(4096)]);
    Some(save_generated(key, || {
        let mut out = RgbaImage::new(w, h);
        let (rmin_sq, rmax_sq) = ((rmin * 2).pow(2), (rmax * 2).pow(2));
        let (width, height) = (w as i64 * 2, h as i64 * 2);
        for row in (1..height).step_by(2) {
            let dy = height - row;
            let mut col_lo = None;
            for x in (1..width).step_by(2) {
                let dx = width - x;
                if dx * dx + dy * dy <= rmax_sq {
                    col_lo = Some(x);
                    break;
                }
            }
            let Some(col_lo) = col_lo else { continue };
            let mut col_hi = width;
            for x in (col_lo..width).step_by(2) {
                let dx = width - x;
                if dx * dx + dy * dy < rmin_sq {
                    col_hi = x;
                    break;
                }
            }
            let y = (row / 2) as u32;
            for x in (col_lo / 2) as u32..(col_hi / 2) as u32 {
                let (sx, sy) = (x1 as u32 + x, y1 as u32 + y);
                if sx < src.width() && sy < src.height() {
                    out.put_pixel(x, y, *src.get_pixel(sx, sy));
                }
            }
        }
        out
    }))
}

pub fn size(id: u32) -> (u32, u32) {
    let reg = registry();
    reg.images.get(id.wrapping_sub(1) as usize).map(|i| (i.width, i.height)).unwrap_or((0, 0))
}

pub fn unload(_id: u32) {}

/// Quantises a colour channel for the tint cache.
fn q(c: f32) -> u32 {
    (c.clamp(0.0, 1.0) * 31.0).round() as u32
}

/// The file to draw layer `layer` (0-based) of image `id` with,
/// multiplied by `rgb`.
pub fn uri(id: u32, layer: u32, rgb: [f32; 3]) -> Option<(Arc<str>, u32, u32)> {
    let mut reg = registry();
    let mut info = reg.images.get(id.wrapping_sub(1) as usize)?;
    let mut id = id;
    if layer > 0 {
        id = *info.layers.get(layer as usize - 1)?;
        info = reg.images.get(id.wrapping_sub(1) as usize)?;
    }
    let base = info.uri.clone()?;
    let (w, h) = (info.width, info.height);
    let key = q(rgb[0]) << 10 | q(rgb[1]) << 5 | q(rgb[2]);
    if key == 0x7fff {
        return Some((base, w, h));
    }
    if let Some(t) = reg.tints.get(&(id, key)) {
        return Some((t.clone(), w, h));
    }
    let file = info.file.clone();
    if reg.pending.insert((id, key)) {
        let _ = worker().send(Job { id, key, file });
    }
    Some((base, w, h))
}

struct Job {
    id: u32,
    key: u32,
    file: Option<PathBuf>,
}

fn worker() -> mpsc::Sender<Job> {
    WORKER
        .get_or_init(|| {
            let (tx, rx) = mpsc::channel::<Job>();
            std::thread::Builder::new()
                .name("pobt-tint".into())
                .spawn(move || {
                    let mut decoded: HashMap<PathBuf, Arc<RgbaImage>> = HashMap::new();
                    while let Ok(job) = rx.recv() {
                        let Some(file) = job.file else { continue };
                        let out = cache_dir().join(format!(
                            "tint-{:016x}-{:04x}.png",
                            hash_of((&file, std::fs::metadata(&file).and_then(|m| m.modified()).ok())),
                            job.key
                        ));
                        if !out.exists() {
                            let src = match decoded.get(&file) {
                                Some(s) => s.clone(),
                                None => {
                                    let Some(img) = decode(&file) else { continue };
                                    if decoded.len() > 32 {
                                        decoded.clear();
                                    }
                                    let img = Arc::new(img);
                                    decoded.insert(file.clone(), img.clone());
                                    img
                                }
                            };
                            let m = [(job.key >> 10) & 31, (job.key >> 5) & 31, job.key & 31].map(|c| c as f32 / 31.0);
                            let mut img = (*src).clone();
                            for p in img.pixels_mut() {
                                for c in 0..3 {
                                    p.0[c] = (p.0[c] as f32 * m[c]).round() as u8;
                                }
                            }
                            if img.save(&out).is_err() {
                                continue;
                            }
                        }
                        let mut reg = registry();
                        reg.tints.insert((job.id, job.key), uri_of(&out));
                        reg.pending.remove(&(job.id, job.key));
                    }
                })
                .expect("tint worker");
            Mutex::new(tx)
        })
        .lock()
        .unwrap()
        .clone()
}
