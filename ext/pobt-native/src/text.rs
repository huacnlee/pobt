//! Text for POB's `DrawString` family: colour escapes, line splitting,
//! measuring and the runs the canvas draws.
//!
//! POB lays out with `DrawStringWidth`, so the widths measured here must match
//! what the canvas draws: both use the same font files, measured with ab_glyph
//! and drawn by the platform under the same family names. Proportional text is
//! Segoe UI, falling back to Microsoft YaHei UI for what it lacks (CJK);
//! `FIXED` is Consolas, falling back the same way. On macOS: Arial, Hiragino
//! Sans GB and Menlo; on Linux: DejaVu Sans, Noto Sans CJK and DejaVu Sans Mono.

use std::{
    cell::RefCell,
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
};

use ab_glyph::{Font, FontArc, GlyphId};

/// How much of POB's line height the em box takes.
pub const EM_PER_HEIGHT: f32 = 0.82;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FontKind {
    Fixed,
    Var,
    VarBold,
}

impl FontKind {
    pub fn parse(name: &str) -> Self {
        match name {
            "FIXED" => FontKind::Fixed,
            "VAR BOLD" => FontKind::VarBold,
            _ => FontKind::Var,
        }
    }

    /// The CSS font shorthand the canvas draws with at `size` px.
    pub fn css(self, size: f32) -> String {
        let fonts = fonts();
        match self {
            FontKind::Fixed => format!(
                "{size:.2}px \"{}\", \"{}\"",
                fonts.mono_family, fonts.cjk_family
            ),
            FontKind::Var => format!(
                "{size:.2}px \"{}\", \"{}\"",
                fonts.latin_family, fonts.cjk_family
            ),
            FontKind::VarBold => format!(
                "bold {size:.2}px \"{}\", \"{}\"",
                fonts.latin_family, fonts.cjk_family
            ),
        }
    }
}

struct LoadedFont {
    font: FontArc,
    /// Pixels per font unit at an em of 1 px.
    unit: f32,
    /// Read on Windows only, for YaHei's baseline.
    #[cfg_attr(not(windows), allow(dead_code))]
    ascent: f32,
}

impl LoadedFont {
    /// The font in `path`; in a collection (`.ttc`), its face `index`.
    fn load(path: &Path, index: u32) -> Option<Self> {
        let data = std::fs::read(path).ok()?;
        let font = FontArc::new(ab_glyph::FontVec::try_from_vec_and_index(data, index).ok()?);
        let upm = font.units_per_em().unwrap_or(1000.0);
        let ascent = font.ascent_unscaled() / upm;
        Some(Self {
            font,
            unit: 1.0 / upm,
            ascent,
        })
    }

    fn advance(&self, id: GlyphId) -> f32 {
        self.font.h_advance_unscaled(id) * self.unit
    }
}

pub struct Fonts {
    latin: Option<LoadedFont>,
    latin_bold: Option<LoadedFont>,
    cjk: Option<LoadedFont>,
    cjk_bold: Option<LoadedFont>,
    mono: Option<LoadedFont>,
    /// Microsoft YaHei's ascent per em: the baseline all text sits on.
    ascent: f32,
    pub latin_family: String,
    pub cjk_family: String,
    pub mono_family: String,
}

static FONTS: OnceLock<Fonts> = OnceLock::new();

#[cfg(windows)]
fn fonts_dirs() -> Vec<PathBuf> {
    let windir = std::env::var_os("WINDIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| "C:\\Windows".into());
    vec![windir.join("Fonts")]
}

#[cfg(target_os = "macos")]
fn fonts_dirs() -> Vec<PathBuf> {
    [
        "/System/Library/Fonts",
        "/System/Library/Fonts/Supplemental",
        "/Library/Fonts",
    ]
    .map(PathBuf::from)
    .to_vec()
}

#[cfg(not(any(windows, target_os = "macos")))]
fn fonts_dirs() -> Vec<PathBuf> {
    [
        "/usr/share/fonts/truetype/dejavu",
        "/usr/share/fonts/TTF",
        "/usr/share/fonts/dejavu",
        "/usr/share/fonts/opentype/noto",
        "/usr/share/fonts/noto-cjk",
        "/usr/share/fonts/google-noto-cjk",
    ]
    .map(PathBuf::from)
    .to_vec()
}

pub fn fonts() -> &'static Fonts {
    FONTS.get_or_init(|| {
        let dirs = fonts_dirs();
        let pick = |names: &[(&str, u32)]| {
            names
                .iter()
                .find_map(|(n, i)| dirs.iter().find_map(|d| LoadedFont::load(&d.join(n), *i)))
        };
        #[cfg(windows)]
        // msyh.ttc's second face is Microsoft YaHei UI, YaHei with a UI's tighter lines.
        let fonts = Fonts {
            latin: pick(&[("segoeui.ttf", 0)]),
            latin_bold: pick(&[("segoeuib.ttf", 0)]),
            cjk: pick(&[("msyh.ttc", 1), ("msyh.ttc", 0), ("simhei.ttf", 0)]),
            cjk_bold: pick(&[("msyhbd.ttc", 1), ("msyh.ttc", 1)]),
            mono: pick(&[("consola.ttf", 0), ("cour.ttf", 0)]),
            ascent: pick(&[("msyh.ttc", 0)]).map(|f| f.ascent).unwrap_or(1.06),
            latin_family: "Segoe UI".into(),
            cjk_family: "Microsoft YaHei UI".into(),
            mono_family: "Consolas".into(),
        };
        // Faces of a collection: Hiragino Sans GB W3 and W6; Menlo Regular.
        #[cfg(target_os = "macos")]
        let fonts = Fonts {
            latin: pick(&[("Arial.ttf", 0)]),
            latin_bold: pick(&[("Arial Bold.ttf", 0)]),
            cjk: pick(&[("Hiragino Sans GB.ttc", 0)]),
            cjk_bold: pick(&[("Hiragino Sans GB.ttc", 2)]),
            mono: pick(&[("Menlo.ttc", 0)]),
            // Text sits where it does on Windows: on YaHei's baseline.
            ascent: 1.06,
            latin_family: "Arial".into(),
            cjk_family: "Hiragino Sans GB".into(),
            mono_family: "Menlo".into(),
        };
        // Noto Sans CJK's third face is its Simplified Chinese.
        #[cfg(not(any(windows, target_os = "macos")))]
        let fonts = Fonts {
            latin: pick(&[("DejaVuSans.ttf", 0)]),
            latin_bold: pick(&[("DejaVuSans-Bold.ttf", 0)]),
            cjk: pick(&[("NotoSansCJK-Regular.ttc", 2)]),
            cjk_bold: pick(&[("NotoSansCJK-Bold.ttc", 2)]),
            mono: pick(&[("DejaVuSansMono.ttf", 0)]),
            ascent: 1.06,
            latin_family: "DejaVu Sans".into(),
            cjk_family: "Noto Sans CJK SC".into(),
            mono_family: "DejaVu Sans Mono".into(),
        };
        fonts
    })
}

/// Width of `ch` at an em of 1 px in `kind`, falling back to YaHei for
/// characters the font lacks (as the platform's font fallback does).
fn char_advance(kind: FontKind, ch: char) -> f32 {
    thread_local! {
        static CACHE: RefCell<HashMap<(FontKind, char), f32>> = RefCell::new(HashMap::new());
    }
    CACHE.with(|cache| {
        if let Some(w) = cache.borrow().get(&(kind, ch)) {
            return *w;
        }
        let f = fonts();
        // As the platform picks: the first family that has the character.
        let (primary, fallback) = match kind {
            FontKind::Fixed => (f.mono.as_ref(), f.cjk.as_ref()),
            FontKind::Var => (f.latin.as_ref(), f.cjk.as_ref()),
            FontKind::VarBold => (f.latin_bold.as_ref(), f.cjk_bold.as_ref()),
        };
        let mut w = 0.5;
        for font in [primary, fallback].into_iter().flatten() {
            let id = font.font.glyph_id(ch);
            if id.0 != 0 {
                w = font.advance(id);
                break;
            }
        }
        cache.borrow_mut().insert((kind, ch), w);
        w
    })
}

/// Distance from the top of a POB text line to the baseline, for an em of
/// `size` px in a line of `height` px. Every face sits on YaHei's baseline,
/// as POB's own fonts share one: Consolas' smaller ascent would lift `FIXED`
/// text off the middle of its line.
pub fn baseline(_kind: FontKind, size: f32, height: f32) -> f32 {
    let ascent = fonts().ascent;
    let descent_gap = (height - size * 1.15).max(0.0) / 2.0;
    descent_gap + ascent * size * 0.92
}

pub fn em_size(height: f32) -> f32 {
    (height * EM_PER_HEIGHT).max(1.0)
}

pub type Color = [f32; 4];

const ESCAPE_COLORS: [Color; 10] = [
    [0.0, 0.0, 0.0, 1.0],
    [1.0, 0.0, 0.0, 1.0],
    [0.0, 1.0, 0.0, 1.0],
    [0.0, 0.0, 1.0, 1.0],
    [1.0, 1.0, 0.0, 1.0],
    [1.0, 0.0, 1.0, 1.0],
    [0.0, 1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0, 1.0],
    [0.7, 0.7, 0.7, 1.0],
    [0.4, 0.4, 0.4, 1.0],
];

/// Length of the colour escape at the start of `s` (`^7`, `^xRRGGBB`), or 0.
pub fn escape_len(s: &[u8]) -> usize {
    if s.len() < 2 || s[0] != b'^' {
        return 0;
    }
    if s[1].is_ascii_digit() {
        return 2;
    }
    if (s[1] == b'x' || s[1] == b'X') && s.len() >= 8 && s[2..8].iter().all(u8::is_ascii_hexdigit) {
        return 8;
    }
    0
}

/// The colour of an escape `escape_len` accepted (alpha 1).
pub fn escape_color(s: &[u8]) -> Color {
    if s[1].is_ascii_digit() {
        return ESCAPE_COLORS[(s[1] - b'0') as usize];
    }
    let hex = |i: usize| {
        u8::from_str_radix(std::str::from_utf8(&s[i..i + 2]).unwrap_or("0"), 16).unwrap_or(0) as f32
            / 255.0
    };
    [hex(2), hex(4), hex(6), 1.0]
}

pub fn strip_escapes(s: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        let n = escape_len(&s[i..]);
        if n > 0 {
            i += n;
        } else {
            out.push(s[i]);
            i += 1;
        }
    }
    out
}

/// Advance of one char of a line, POB style: tabs are four spaces.
fn advance(kind: FontKind, size: f32, ch: char) -> f32 {
    if ch == '\t' {
        return char_advance(kind, ' ') * size * 4.0;
    }
    char_advance(kind, ch) * size
}

/// Width of one line (no newlines), escapes skipped.
pub fn line_width(kind: FontKind, height: f32, line: &str) -> f32 {
    let size = em_size(height);
    let bytes = line.as_bytes();
    let mut w = 0.0;
    let mut i = 0;
    while i < bytes.len() {
        let n = escape_len(&bytes[i..]);
        if n > 0 {
            i += n;
            continue;
        }
        let ch = line[i..].chars().next().unwrap();
        w += advance(kind, size, ch);
        i += ch.len_utf8();
    }
    w.ceil()
}

/// `DrawStringWidth`: the widest line.
pub fn string_width(kind: FontKind, height: f32, s: &str) -> f32 {
    s.split('\n')
        .map(|l| line_width(kind, height, l))
        .fold(0.0, f32::max)
}

/// `DrawStringCursorIndex`: the byte index (0-based) under (`cx`, `cy`).
pub fn cursor_index(kind: FontKind, height: f32, s: &str, cx: f32, cy: f32) -> usize {
    let size = em_size(height);
    let mut line_start = 0;
    let mut line_y = height;
    let lines: Vec<&str> = s.split('\n').collect();
    for (n, line) in lines.iter().enumerate() {
        if cy <= line_y || n + 1 == lines.len() {
            let bytes = line.as_bytes();
            let mut x = 0.0;
            let mut i = 0;
            while i < bytes.len() {
                let e = escape_len(&bytes[i..]);
                if e > 0 {
                    i += e;
                    continue;
                }
                let ch = line[i..].chars().next().unwrap();
                let w = advance(kind, size, ch);
                if cx <= x + w / 2.0 {
                    break;
                }
                x += w;
                i += ch.len_utf8();
            }
            return line_start + i;
        }
        line_start += line.len() + 1;
        line_y += height;
    }
    s.len()
}

/// One stretch of text in one colour, positioned at its top-left.
#[derive(Debug, Clone, PartialEq)]
pub struct TextRun {
    pub x: f32,
    pub y: f32,
    pub text: Arc<str>,
    pub color: Color,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    Left,
    Center,
    Right,
    CenterX,
    RightX,
}

impl Align {
    pub fn parse(s: &str) -> Self {
        match s {
            "CENTER" => Align::Center,
            "RIGHT" => Align::Right,
            "CENTER_X" => Align::CenterX,
            "RIGHT_X" => Align::RightX,
            _ => Align::Left,
        }
    }
}

/// One line laid out from its start: its width and its runs, each at an
/// offset, in the colour of an escape before it (`None`: the colour the
/// line starts in).
struct LineLayout {
    width: f32,
    runs: Vec<(f32, Arc<str>, Option<Color>)>,
    /// The colour the line leaves current, if it set one.
    end: Option<Color>,
}

fn layout_line(kind: FontKind, height: f32, line: &str) -> Arc<LineLayout> {
    thread_local! {
        static CACHE: RefCell<HashMap<(FontKind, u32, Box<str>), Arc<LineLayout>>> = RefCell::new(HashMap::new());
    }
    let key = (kind, height.to_bits(), Box::<str>::from(line));
    if let Some(hit) = CACHE.with(|c| c.borrow().get(&key).cloned()) {
        return hit;
    }
    let size = em_size(height);
    let bytes = line.as_bytes();
    let mut runs = Vec::new();
    let mut color: Option<Color> = None;
    let (mut x, mut run_x) = (0.0f32, 0.0f32);
    let mut run = String::new();
    let mut i = 0;
    let flush = |run: &mut String,
                 run_x: f32,
                 color: Option<Color>,
                 runs: &mut Vec<(f32, Arc<str>, Option<Color>)>| {
        if !run.trim().is_empty() {
            runs.push((run_x, Arc::from(run.replace('\t', "    ").as_str()), color));
        }
        run.clear();
    };
    while i < bytes.len() {
        let e = escape_len(&bytes[i..]);
        if e > 0 {
            flush(&mut run, run_x, color, &mut runs);
            color = Some(escape_color(&bytes[i..]));
            i += e;
            run_x = x;
            continue;
        }
        let ch = line[i..].chars().next().unwrap();
        run.push(ch);
        x += advance(kind, size, ch);
        i += ch.len_utf8();
    }
    flush(&mut run, run_x, color, &mut runs);
    let layout = Arc::new(LineLayout {
        width: line_width(kind, height, line),
        runs,
        end: color,
    });
    CACHE.with(|c| {
        let mut c = c.borrow_mut();
        if c.len() > 50_000 {
            c.clear();
        }
        c.insert(key, layout.clone());
    });
    layout
}

/// Splits `s` into coloured runs placed as SimpleGraphic places them,
/// starting in `color`; returns the runs and the colour left current.
pub fn layout(
    kind: FontKind,
    height: f32,
    s: &str,
    x: f32,
    y: f32,
    align: Align,
    screen_w: f32,
    mut color: Color,
) -> (Vec<TextRun>, Color) {
    let mut runs = Vec::new();
    let mut line_y = y.floor();
    for line in s.split('\n') {
        if !line.is_empty() {
            let l = layout_line(kind, height, line);
            let start = match align {
                Align::Left => x,
                Align::Center => ((screen_w - l.width) / 2.0 + x).floor(),
                Align::Right => (screen_w - l.width - x).floor(),
                Align::CenterX => (x - l.width / 2.0).floor(),
                Align::RightX => (x - l.width).floor(),
            }
            .round();
            for (offset, text, c) in &l.runs {
                runs.push(TextRun {
                    x: start + offset,
                    y: line_y,
                    text: text.clone(),
                    color: c.unwrap_or(color),
                });
            }
            if let Some(end) = l.end {
                color = end;
            }
        }
        line_y += height;
    }
    (runs, color)
}
