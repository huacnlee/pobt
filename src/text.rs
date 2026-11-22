//! Text for POB's `DrawString` family: colour escapes, line splitting,
//! measuring and the runs the canvas draws.
//!
//! POB lays out with `DrawStringWidth`, so the widths measured here must match
//! what the canvas draws: both use the same font files (Microsoft YaHei for
//! proportional text and CJK, Consolas for `FIXED`), measured with ab_glyph
//! and drawn by the platform under the same family names.

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
            FontKind::Fixed => format!("{size:.2}px \"{}\", \"{}\"", fonts.mono_family, fonts.var_family),
            FontKind::Var => format!("{size:.2}px \"{}\"", fonts.var_family),
            FontKind::VarBold => format!("bold {size:.2}px \"{}\"", fonts.var_family),
        }
    }
}

struct LoadedFont {
    font: FontArc,
    /// Pixels per font unit at an em of 1 px.
    unit: f32,
    ascent: f32,
}

impl LoadedFont {
    fn load(path: &Path) -> Option<Self> {
        let data = std::fs::read(path).ok()?;
        let font = FontArc::try_from_vec(data.clone())
            .ok()
            .or_else(|| {
                // .ttc collections: the first face.
                let face = ab_glyph::FontVec::try_from_vec_and_index(data, 0).ok()?;
                Some(FontArc::new(face))
            })?;
        let upm = font.units_per_em().unwrap_or(1000.0);
        let ascent = font.ascent_unscaled() / upm;
        Some(Self { font, unit: 1.0 / upm, ascent })
    }

    fn advance(&self, id: GlyphId) -> f32 {
        self.font.h_advance_unscaled(id) * self.unit
    }
}

pub struct Fonts {
    var: Option<LoadedFont>,
    bold: Option<LoadedFont>,
    mono: Option<LoadedFont>,
    pub var_family: String,
    pub mono_family: String,
}

static FONTS: OnceLock<Fonts> = OnceLock::new();

fn fonts_dir() -> PathBuf {
    let windir = std::env::var_os("WINDIR").map(PathBuf::from).unwrap_or_else(|| "C:\\Windows".into());
    windir.join("Fonts")
}

pub fn fonts() -> &'static Fonts {
    FONTS.get_or_init(|| {
        let dir = fonts_dir();
        let pick = |names: &[&str]| names.iter().find_map(|n| LoadedFont::load(&dir.join(n)));
        Fonts {
            var: pick(&["msyh.ttc", "simhei.ttf", "segoeui.ttf"]),
            bold: pick(&["msyhbd.ttc", "msyh.ttc", "segoeuib.ttf"]),
            mono: pick(&["consola.ttf", "cour.ttf"]),
            var_family: "Microsoft YaHei".into(),
            mono_family: "Consolas".into(),
        }
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
        let primary = match kind {
            FontKind::Fixed => f.mono.as_ref(),
            FontKind::Var => f.var.as_ref(),
            FontKind::VarBold => f.bold.as_ref(),
        };
        let mut w = 0.5;
        for font in [primary, f.var.as_ref()].into_iter().flatten() {
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
/// `size` px in a line of `height` px.
pub fn baseline(kind: FontKind, size: f32, height: f32) -> f32 {
    let f = fonts();
    let font = match kind {
        FontKind::Fixed => f.mono.as_ref(),
        _ => f.var.as_ref(),
    };
    let ascent = font.map(|f| f.ascent).unwrap_or(0.9);
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
    let hex = |i: usize| u8::from_str_radix(std::str::from_utf8(&s[i..i + 2]).unwrap_or("0"), 16).unwrap_or(0) as f32 / 255.0;
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
    s.split('\n').map(|l| line_width(kind, height, l)).fold(0.0, f32::max)
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
    let size = em_size(height);
    let mut runs = Vec::new();
    let mut line_y = y.floor();
    for line in s.split('\n') {
        if !line.is_empty() {
            let width = line_width(kind, height, line);
            let mut cx = match align {
                Align::Left => x,
                Align::Center => ((screen_w - width) / 2.0 + x).floor(),
                Align::Right => (screen_w - width - x).floor(),
                Align::CenterX => (x - width / 2.0).floor(),
                Align::RightX => (x - width).floor(),
            }
            .round();
            let bytes = line.as_bytes();
            let mut i = 0;
            let mut run = String::new();
            let mut run_x = cx;
            let flush = |run: &mut String, run_x: f32, color: Color, runs: &mut Vec<TextRun>| {
                if !run.trim().is_empty() {
                    runs.push(TextRun { x: run_x, y: line_y, text: Arc::from(run.replace('\t', "    ").as_str()), color });
                }
                run.clear();
            };
            while i < bytes.len() {
                let e = escape_len(&bytes[i..]);
                if e > 0 {
                    flush(&mut run, run_x, color, &mut runs);
                    color = escape_color(&bytes[i..]);
                    i += e;
                    run_x = cx;
                    continue;
                }
                let ch = line[i..].chars().next().unwrap();
                run.push(ch);
                cx += advance(kind, size, ch);
                i += ch.len_utf8();
            }
            flush(&mut run, run_x, color, &mut runs);
        }
        line_y += height;
    }
    (runs, color)
}
