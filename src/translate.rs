//! The dictionary: `en,zh` CSV files in PoeCharm's format, matched exactly
//! or as templates whose `{0}` / `#` stand for the numbers of the text.

use std::{
    collections::HashMap,

    sync::{Arc, RwLock},
};

use crate::text::escape_len;

#[derive(Default)]
pub struct Dictionary {
    exact: HashMap<String, String>,
    /// `exact` by its English in lower case, for text whose case differs.
    folded: HashMap<String, String>,
    /// Key: the English with each placeholder as `\u{1}`; value: the
    /// translation and, per placeholder in the English, its number index.
    templates: HashMap<String, Template>,
}

struct Template {
    text: String,
}

/// With `POBT_MISSES` set to a file: the text no rule translated, and how often
/// each was drawn, written to that file now and then (`dump_misses`).
static MISSES: std::sync::Mutex<Option<HashMap<String, u32>>> = std::sync::Mutex::new(None);

fn misses_on() -> bool {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ON.get_or_init(|| std::env::var_os("POBT_MISSES").is_some())
}

/// Writes the misses so far, most drawn first, when `POBT_MISSES` is set.
pub fn dump_misses() {
    let Some(path) = std::env::var_os("POBT_MISSES") else { return };
    let Some(misses) = MISSES.lock().unwrap().clone() else { return };
    let mut list: Vec<_> = misses.into_iter().collect();
    list.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let text: String = list.iter().map(|(s, n)| format!("{n}	{s}
")).collect();
    let _ = std::fs::write(path, text);
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
    /// The dictionary of `language`: the CSV files of `trs/<language>`.
    pub fn load(language: &str) -> Self {
        let mut dict = Dictionary::default();
        for (_, data) in crate::trs::files(language) {
            let mut reader = csv::ReaderBuilder::new()
                .has_headers(false)
                .flexible(true)
                .from_reader(data.as_ref());
            for record in reader.byte_records().flatten() {
                if record.len() < 2 {
                    continue;
                }
                let en = String::from_utf8_lossy(&record[0]).trim_start_matches('\u{feff}').to_string();
                let zh = String::from_utf8_lossy(&record[1]).to_string();
                dict.insert(en, zh);
            }
        }
        log::info!("dictionary {language}: {} entries, {} templates", dict.exact.len(), dict.templates.len());
        dict
    }

    fn insert(&mut self, en: String, zh: String) {
        let en_t = en.trim();
        if en_t.is_empty() || zh.trim().is_empty() || en_t.starts_with("##") {
            return;
        }
        if let Some(key) = template_key(en_t) {
            self.templates.entry(key).or_insert(Template { text: zh.trim().to_string() });
        }
        // Exact too: a `#` may be the text's own ("# of Power Charges:"), not a number's.
        self.exact.entry(en_t.to_string()).or_insert_with(|| zh.trim().to_string());
        self.folded.entry(en_t.to_lowercase()).or_insert_with(|| zh.trim().to_string());
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
        let found = self.lookup(seg);
        let t = seg.trim();
        if found.is_none() && misses_on() && t.bytes().any(|c| c.is_ascii_alphabetic()) {
            *MISSES.lock().unwrap().get_or_insert_default().entry(t.to_string()).or_default() += 1;
        }
        found
    }

    /// `segment`'s lookup, which notes no miss.
    fn lookup(&self, seg: &str) -> Option<String> {
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
            })
            .or_else(|| {
                // "Label" when only "Label:" is known (POB adds the colon as it draws some).
                let known = self.exact.get(&format!("{t}:"))?;
                Some(known.trim_end_matches([':', '：']).trim_end().to_string())
            })
            .or_else(|| self.folded.get(&t.to_lowercase()).cloned());
        found.map(|f| format!("{lead}{f}{trail}"))
    }

    /// `s` translated as one, its colour escapes left out, when it has some
    /// inside it: the translation keeps the colour `s` starts with.
    fn whole(&self, s: &str) -> Option<String> {
        let b = s.as_bytes();
        let mut plain = String::with_capacity(s.len());
        let mut lead = "";
        let mut inner = false;
        let mut i = 0;
        while i < b.len() {
            let e = escape_len(&b[i..]);
            if e > 0 {
                if plain.trim().is_empty() {
                    lead = &s[i..i + e];
                } else {
                    inner = true;
                }
                i += e;
            } else {
                let ch = s[i..].chars().next().unwrap();
                plain.push(ch);
                i += ch.len_utf8();
            }
        }
        if !inner || plain.contains('\n') {
            return None;
        }
        let t = self.lookup(&plain)?;
        Some(if t.trim_start().starts_with('^') { t } else { format!("{lead}{t}") })
    }

    /// Translates `s`, keeping its colour escapes; `None` if nothing changed.
    pub fn translate(&self, s: &str) -> Option<String> {
        // A sentence coloured in parts ("Are you always on Full ^xE05030Life?") is known whole, without its
        // colours: its translation brings its own.
        if let Some(whole) = self.whole(s) {
            return Some(whole);
        }
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

    /// The real dictionary on POB's own labels.
    #[test]
    fn labels_with_colours_and_hashes() {
        let d = Dictionary::load("zh-rCN");
        assert_eq!(d.translate("# of Power Charges (if not maximum):").as_deref(), Some("【暴击球】数量 (如果不是最大值):"));
        assert_eq!(d.translate("^7# of Gale Force:").as_deref(), Some("^7【飓风之力】个数"));
        assert_eq!(d.translate("Are you always on Full ^xE05030Life?").as_deref(), Some("^xFFFFFF是否处于满^xE05030血^7状态?"));
        assert_eq!(d.translate("Current build:").as_deref(), Some("当前 BD:"));
    }

    /// How much of POB's mod text the dictionary translates, and the shapes it
    /// misses most: `POB_DIR=<folder> cargo test --lib coverage -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn coverage() {
        let pob = std::path::PathBuf::from(std::env::var("POB_DIR").expect("POB_DIR"));
        let d = Dictionary::load(&std::env::var("POB_LANG").unwrap_or("zh-rCN".into()));
        let cache = std::fs::read_to_string(pob.join("Data/ModCache.lua")).unwrap();
        let lines: Vec<String> = cache
            .lines()
            .filter_map(|l| l.strip_prefix("c[\"")?.split_once("\"]=").map(|(k, _)| k.replace("\n", "
")))
            .filter(|k| !k.trim().is_empty())
            .collect();
        let mut missed: HashMap<String, (u32, String)> = HashMap::new();
        let mut hit = 0;
        for l in &lines {
            if d.translate(l).is_some() {
                hit += 1;
            } else {
                let shape: String = l.chars().map(|c| if c.is_ascii_digit() { '#' } else { c }).collect();
                let e = missed.entry(shape).or_insert((0, l.clone()));
                e.0 += 1;
            }
        }
        println!("mods: {} of {} translated ({:.1}%)", hit, lines.len(), hit as f64 * 100.0 / lines.len() as f64);

        // The labels of POB's controls and options.
        let mut labels: Vec<String> = Vec::new();
        for dir in ["Classes", "Modules"] {
            for e in std::fs::read_dir(pob.join(dir)).unwrap().flatten() {
                let src = std::fs::read_to_string(e.path()).unwrap_or_default();
                for part in src.split("label = \"").skip(1) {
                    if let Some((l, _)) = part.split_once('"') {
                        labels.push(l.to_string());
                    }
                }
            }
        }
        labels.sort();
        labels.dedup();
        let missed_labels: Vec<_> = labels.iter().filter(|l| l.bytes().any(|c| c.is_ascii_alphabetic()) && d.translate(l).is_none()).collect();
        println!("labels: {} of {} missed", missed_labels.len(), labels.len());
        for l in missed_labels.iter().take(80) {
            println!("   {l}");
        }
        let mut list: Vec<_> = missed.into_iter().collect();
        list.sort_by(|a, b| b.1.0.cmp(&a.1.0));
        for (shape, (n, example)) in list.iter().take(60) {
            println!("{n:5}  {shape}    e.g. {example}");
        }
    }

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
