//! The dictionary: `en,zh` CSV files in PoeCharm's format, matched exactly
//! or as templates whose `{0}` / `#` stand for the numbers of the text.

use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, RwLock},
};

use crate::text::escape_len;

#[derive(Default)]
pub struct Dictionary {
    exact: HashMap<String, String>,
    /// Key: the English with each placeholder as `\u{1}`; value: the
    /// translation and, per placeholder in the English, its number index.
    templates: HashMap<String, Template>,
}

struct Template {
    text: String,
}

/// The dictionary in use; empty until one loads.
pub static DICT: RwLock<Option<Arc<Dictionary>>> = RwLock::new(None);

pub fn current() -> Option<Arc<Dictionary>> {
    DICT.read().ok()?.clone()
}

const HOLE: char = '\u{1}';

/// The English of a template made a key: `{N}` and `#` become holes.
fn template_key(en: &str) -> Option<String> {
    let mut out = String::with_capacity(en.len());
    let mut holes = 0;
    let mut chars = en.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        if c == '{' {
            let rest = &en[i + 1..];
            let digits = rest.chars().take_while(char::is_ascii_digit).count();
            if digits > 0 && rest[digits..].starts_with('}') {
                out.push(HOLE);
                holes += 1;
                for _ in 0..digits + 1 {
                    chars.next();
                }
                continue;
            }
        }
        if c == '#' {
            out.push(HOLE);
            holes += 1;
            continue;
        }
        out.push(c);
    }
    (holes > 0).then_some(out)
}

impl Dictionary {
    pub fn load_dir(dir: &Path) -> std::io::Result<Self> {
        let mut dict = Dictionary::default();
        let mut files: Vec<_> = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("csv")))
            .collect();
        files.sort();
        for file in files {
            let Ok(data) = std::fs::read(&file) else { continue };
            let mut reader = csv::ReaderBuilder::new()
                .has_headers(false)
                .flexible(true)
                .from_reader(data.as_slice());
            for record in reader.byte_records().flatten() {
                if record.len() < 2 {
                    continue;
                }
                let en = String::from_utf8_lossy(&record[0]).trim_start_matches('\u{feff}').to_string();
                let zh = String::from_utf8_lossy(&record[1]).to_string();
                dict.insert(en, zh);
            }
        }
        log::info!("dictionary: {} entries, {} templates", dict.exact.len(), dict.templates.len());
        Ok(dict)
    }

    fn insert(&mut self, en: String, zh: String) {
        let en_t = en.trim();
        if en_t.is_empty() || zh.trim().is_empty() || en_t.starts_with("##") {
            return;
        }
        if let Some(key) = template_key(en_t) {
            self.templates.entry(key).or_insert(Template { text: zh.trim().to_string() });
        } else {
            self.exact.entry(en_t.to_string()).or_insert_with(|| zh.trim().to_string());
        }
    }

    fn lookup_template(&self, s: &str, signed: bool) -> Option<String> {
        let mut key = String::with_capacity(s.len());
        let mut nums: Vec<&str> = Vec::new();
        let b = s.as_bytes();
        let mut i = 0;
        while i < b.len() {
            let start = i;
            let mut j = i;
            if signed && (b[j] == b'+' || b[j] == b'-') && j + 1 < b.len() && b[j + 1].is_ascii_digit() {
                j += 1;
            }
            if j < b.len() && b[j].is_ascii_digit() {
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                if j + 1 < b.len() && b[j] == b'.' && b[j + 1].is_ascii_digit() {
                    j += 1;
                    while j < b.len() && b[j].is_ascii_digit() {
                        j += 1;
                    }
                }
                nums.push(&s[start..j]);
                key.push(HOLE);
                i = j;
                continue;
            }
            let ch = s[i..].chars().next().unwrap();
            key.push(ch);
            i += ch.len_utf8();
        }
        if nums.is_empty() {
            return None;
        }
        let t = self.templates.get(&key)?;
        Some(fill(&t.text, &nums))
    }

    /// The translation of one plain segment (no escapes), whitespace kept.
    fn segment(&self, seg: &str) -> Option<String> {
        let t = seg.trim();
        if t.is_empty() || !t.bytes().any(|c| c.is_ascii_alphabetic()) {
            return None;
        }
        let lead = &seg[..seg.len() - seg.trim_start().len()];
        let trail = &seg[seg.trim_end().len()..];
        let found = self
            .exact
            .get(t)
            .cloned()
            .or_else(|| self.lookup_template(t, true))
            .or_else(|| self.lookup_template(t, false))
            .or_else(|| {
                // "Label:" when only "Label" is known.
                let base = t.strip_suffix(':')?;
                Some(format!("{}:", self.exact.get(base.trim_end())?))
            });
        found.map(|f| format!("{lead}{f}{trail}"))
    }

    /// Translates `s`, keeping its colour escapes; `None` if nothing changed.
    pub fn translate(&self, s: &str) -> Option<String> {
        let b = s.as_bytes();
        let mut out = String::with_capacity(s.len());
        let mut changed = false;
        let mut seg_start = 0;
        let mut i = 0;
        let mut flush = |out: &mut String, seg: &str| {
            for (n, line) in seg.split('\n').enumerate() {
                if n > 0 {
                    out.push('\n');
                }
                match self.segment(line) {
                    Some(t) => {
                        changed = true;
                        out.push_str(&t);
                    }
                    None => out.push_str(line),
                }
            }
        };
        while i < b.len() {
            let e = escape_len(&b[i..]);
            if e > 0 {
                flush(&mut out, &s[seg_start..i]);
                out.push_str(&s[i..i + e]);
                i += e;
                seg_start = i;
            } else {
                i += 1;
            }
        }
        flush(&mut out, &s[seg_start..]);
        changed.then_some(out)
    }
}

/// The translation with its `{N}` (or `#`, in order) replaced by `nums`.
fn fill(text: &str, nums: &[&str]) -> String {
    let mut out = String::with_capacity(text.len() + 8);
    let mut next = 0;
    let mut chars = text.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        if c == '{' {
            let rest = &text[i + 1..];
            let digits = rest.chars().take_while(char::is_ascii_digit).count();
            if digits > 0 && rest[digits..].starts_with('}') {
                let n: usize = rest[..digits].parse().unwrap_or(0);
                out.push_str(nums.get(n).copied().unwrap_or(""));
                for _ in 0..digits + 1 {
                    chars.next();
                }
                continue;
            }
        }
        if c == '#' {
            out.push_str(nums.get(next).copied().unwrap_or("#"));
            next += 1;
            continue;
        }
        out.push(c);
    }
    out
}

/// A per-thread cache in front of the dictionary: POB draws the same
/// strings every frame.
pub struct Cache {
    dict: Option<Arc<Dictionary>>,
    map: HashMap<Box<str>, Option<Arc<str>>>,
}

impl Cache {
    pub fn new() -> Self {
        Self { dict: None, map: HashMap::new() }
    }

    /// The text to show for `s`: its translation, or `s` itself.
    pub fn get(&mut self, s: &str) -> Option<Arc<str>> {
        let dict = current();
        if !same(&dict, &self.dict) {
            self.dict = dict;
            self.map.clear();
        }
        let dict = self.dict.as_ref()?;
        if let Some(hit) = self.map.get(s) {
            return hit.clone();
        }
        if self.map.len() > 200_000 {
            self.map.clear();
        }
        let t = dict.translate(s).map(Arc::from);
        self.map.insert(s.into(), t.clone());
        t
    }
}

fn same(a: &Option<Arc<Dictionary>>, b: &Option<Arc<Dictionary>>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        (None, None) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dict() -> Dictionary {
        let mut d = Dictionary::default();
        d.insert("Life".into(), "生命".into());
        d.insert("{0}% less Effect of your Curses".into(), "你的诅咒效果总降 {0}%".into());
        d.insert("+# to maximum Mana".into(), "# 最大魔力".into());
        d.insert("Required Level: {0}".into(), "需求的等级: {0}".into());
        d
    }

    #[test]
    fn exact_and_templates() {
        let d = dict();
        assert_eq!(d.translate("Life").as_deref(), Some("生命"));
        assert_eq!(d.translate("  Life ").as_deref(), Some("  生命 "));
        assert_eq!(d.translate("12% less Effect of your Curses").as_deref(), Some("你的诅咒效果总降 12%"));
        assert_eq!(d.translate("+30 to maximum Mana").as_deref(), Some("30 最大魔力"));
        assert_eq!(d.translate("Required Level: 64").as_deref(), Some("需求的等级: 64"));
        assert_eq!(d.translate("Life:").as_deref(), Some("生命:"));
        assert_eq!(d.translate("^7Life^x33FF77 12% less Effect of your Curses").as_deref(), Some("^7生命^x33FF77 你的诅咒效果总降 12%"));
        assert_eq!(d.translate("Mana"), None);
    }
}
