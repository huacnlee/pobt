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
    /// Entries with a `{name}` hole, for a name POB puts in ("{name} has no
    /// base cooldown"): the English before and after it, and the translation.
    named: Vec<(String, String, String)>,
}

const NAME: &str = "{name}";

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
        if c == '#' && !en[i + 1..].starts_with('{') {
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
        log::info!("dictionary {language}: {} entries, {} templates", dict.exact.len(), dict.templates.len());
        dict
    }

    fn insert(&mut self, en: String, zh: String) {
        let en_t = en.trim();
        if en_t.is_empty() || zh.trim().is_empty() || en_t.starts_with("##") {
            return;
        }
        if let Some((before, after)) = en_t.split_once(NAME) {
            if !after.contains(NAME) {
                self.named.push((before.to_string(), after.to_string(), zh.trim().to_string()));
            }
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
            // A value range, "(1-2)" or "+(-10-10)": one number to the template.
            let sign = usize::from(signed && b[j] == b'+');
            if let Some(n) = range_len(&b[j + sign..]) {
                nums.push(&s[start..j + sign + n]);
                key.push(HOLE);
                i = j + sign + n;
                continue;
            }
            if signed && (b[j] == b'+' || b[j] == b'-') && j + 1 < b.len() && b[j + 1].is_ascii_digit() {
                j += 1;
            }
            if j < b.len() && b[j].is_ascii_digit() {
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                // "23,059": POB's thousands separators, a comma before exactly three digits.
                while j + 3 < b.len() && b[j] == b',' && b[j + 1..j + 4].iter().all(u8::is_ascii_digit) && !b.get(j + 4).is_some_and(u8::is_ascii_digit) {
                    j += 4;
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
        self.inner(t).map(|f| format!("{lead}{f}{trail}"))
    }

    /// The translation of trimmed text: the dictionary's rules, then text POB
    /// builds around them.
    fn inner(&self, t: &str) -> Option<String> {
        if t.is_empty() || !t.bytes().any(|c| c.is_ascii_alphabetic()) {
            return None;
        }
        self.exact
            .get(t)
            .cloned()
            .or_else(|| self.lookup_template(t, true))
            .or_else(|| self.lookup_template(t, false))
            .or_else(|| {
                // "Label:" when only "Label" is known, or its template ("Flask 1:" by "Flask {0}").
                let base = t.strip_suffix(':')?.trim_end();
                let known = self.exact.get(base).cloned().or_else(|| self.lookup_template(base, false))?;
                Some(format!("{known}:"))
            })
            .or_else(|| {
                // "Label" when only "Label:" is known (POB adds the colon as it draws some).
                let known = self.exact.get(&format!("{t}:"))?;
                Some(known.trim_end_matches([':', '：']).trim_end().to_string())
            })
            .or_else(|| self.folded.get(&t.to_lowercase()).cloned())
            .or_else(|| self.named(t))
            .or_else(|| self.supported(t))
            .or_else(|| self.phrase(t))
            .or_else(|| self.wrapped(t))
            .or_else(|| self.labelled(t))
            .or_else(|| self.joined(t))
            .or_else(|| self.listed(t))
            .or_else(|| self.noted(t))
            .or_else(|| Some(format!("- {}", self.inner(t.strip_prefix("- ")?)?)))
            .or_else(|| self.delta(t))
    }

    /// "Tornado Shot has no base cooldown or cooldown override": an entry's
    /// `{name}` filled with the name POB put there, translated when known.
    fn named(&self, t: &str) -> Option<String> {
        self.named.iter().find_map(|(before, after, zh)| {
            let name = t.strip_prefix(before.as_str())?.strip_suffix(after.as_str())?.trim();
            if name.is_empty() {
                return None;
            }
            let name = self.inner(name).unwrap_or_else(|| name.to_string());
            Some(zh.replace(NAME, &name))
        })
    }

    /// "Tornado Shot (Disabled)": a known text and a known note in brackets
    /// after it, the note known with its brackets or without.
    fn noted(&self, t: &str) -> Option<String> {
        let (text, note) = t.strip_suffix(')')?.rsplit_once(" (")?;
        let text = self.inner(text)?;
        let note = self.inner(&format!("({note})")).or_else(|| Some(format!("({})", self.inner(note)?)))?;
        Some(format!("{text} {note}"))
    }

    /// "Hyrri's Truth, Jade Amulet" and "Arctic Armour, Grace, Precision": a
    /// list whose every part is known, but its first, which may be a name the
    /// user gave (a rare item's), kept as it is.
    fn listed(&self, t: &str) -> Option<String> {
        let parts: Vec<&str> = t.split(", ").collect();
        if parts.len() < 2 {
            return None;
        }
        let mut out = vec![self.inner(parts[0]).unwrap_or_else(|| parts[0].to_string())];
        for part in &parts[1..] {
            out.push(self.inner(part)?);
        }
        Some(out.join(", "))
    }

    /// "+0.01 Attack Rate (+0.5%)" and "-4,733.7 Average Damage": a change of
    /// a known stat, as POB lists them in its comparison tooltips.
    fn delta(&self, t: &str) -> Option<String> {
        let num = t.find(' ')?;
        let (value, rest) = (&t[..num], &t[num + 1..]);
        // a length or a time keeps its unit ("-0.5m AoE Radius", "+1.2s ...")
        let digits = value.get(1..).unwrap_or("");
        let digits = digits.strip_suffix(['m', 's']).unwrap_or(digits);
        if !value.starts_with(['+', '-'])
            || !digits.starts_with(|c: char| c.is_ascii_digit())
            || !digits.bytes().all(|c| c.is_ascii_digit() || b".,%".contains(&c))
        {
            return None;
        }
        let (stat, tail) = match rest.rfind(" (") {
            Some(i) if rest.ends_with(')') => (&rest[..i], &rest[i..]),
            _ => (rest, ""),
        };
        let stat = self
            .exact
            .get(stat)
            .cloned()
            .or_else(|| Some(self.exact.get(&format!("{stat}:"))?.trim_end_matches([':', '：']).trim_end().to_string()))?;
        Some(format!("{value} {stat}{tail}"))
    }

    /// "(Guard)" and "[3.27] Default": a known word in brackets, or after them.
    fn wrapped(&self, t: &str) -> Option<String> {
        if let Some(word) = t.strip_prefix('(').and_then(|w| w.strip_suffix(')')) {
            return Some(format!("({})", self.inner(word)?));
        }
        let (tag, rest) = t.strip_prefix('[')?.split_once("] ")?;
        Some(format!("[{tag}] {}", self.inner(rest)?))
    }

    /// "Current build:  Name" and "Version: 2.68.1": a known label and the
    /// value POB put after it, which is translated when known.
    fn labelled(&self, t: &str) -> Option<String> {
        let (label, value) = t.split_once(':')?;
        let gap = &value[..value.len() - value.trim_start().len()];
        let value = value.trim_start();
        if gap.is_empty() || value.is_empty() {
            return None;
        }
        let label = self.inner(&format!("{}:", label.trim_end()))?;
        let value = self.inner(value).unwrap_or_else(|| value.to_string());
        Some(format!("{label}{gap}{value}"))
    }

    /// "1 Mirage Archers using Tornado Shot": both sides known, joined by the
    /// dictionary's `{0} using {1}`.
    fn joined(&self, t: &str) -> Option<String> {
        let (a, b) = t.split_once(" using ")?;
        let join = self.templates.get(&format!("{HOLE} using {HOLE}"))?;
        Some(fill(&join.text, &[&self.inner(a)?, &self.inner(b)?]))
    }

    /// "Socketed Gems are Supported by Level 12 Fortify Support": the
    /// dictionary's line for that gem, which leaves out "Support", or else the
    /// gem's own name put in `... Level {0} {1} Support`.
    fn supported(&self, t: &str) -> Option<String> {
        const LINE: &str = "Socketed Gems are Supported by Level {0} {1} Support";
        let name = t.strip_suffix(" Support")?;
        let (level, gem) = name.strip_prefix("Socketed Gems are Supported by Level ")?.split_once(' ')?;
        if !(level.bytes().all(|c| c.is_ascii_digit()) || range_len(level.as_bytes()) == Some(level.len())) {
            return None;
        }
        if let Some(known) = self.lookup_template(name, false) {
            return Some(known);
        }
        let gem = self
            .exact
            .get(gem)
            .or_else(|| self.exact.get(&format!("{gem} Support")))
            .or_else(|| self.folded.get(&gem.to_lowercase()))?;
        let gem = ["（辅）", "(辅)", "（辅助）", "(辅助)", "辅助"].iter().fold(gem.trim(), |g, s| g.strip_suffix(s).unwrap_or(g)).trim();
        Some(fill(self.exact.get(LINE)?, &[level, gem]))
    }

    /// "Drops from Aul, the Crystal King" and "Current (4 variants)": text POB
    /// builds around names, by the dictionary's line for each shape here, the
    /// names translated when known.
    fn phrase(&self, t: &str) -> Option<String> {
        const PHRASES: &[&str] = &["{0} ({1} variants)", "Drops from {0} in {1}", "Drops from {0}", "Drops in {0}"];
        'shapes: for shape in PHRASES {
            let shape_lits = shape.replace("{1}", "{0}");
            let lits: Vec<&str> = shape_lits.split("{0}").collect();
            let Some(mut rest) = t.strip_prefix(lits[0]).and_then(|r| r.strip_suffix(lits[lits.len() - 1])) else {
                continue;
            };
            let mut names = Vec::new();
            for lit in &lits[1..lits.len() - 1] {
                let Some((name, after)) = rest.split_once(lit) else { continue 'shapes };
                names.push(name);
                rest = after;
            }
            names.push(rest);
            if names.iter().any(|n| n.trim().is_empty()) {
                continue;
            }
            let Some(line) = self.exact.get(*shape) else { continue };
            let names: Vec<String> = names.iter().map(|n| self.inner(n).unwrap_or_else(|| n.to_string())).collect();
            return Some(fill(line, &names.iter().map(String::as_str).collect::<Vec<_>>()));
        }
        None
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
        // Part by part, its colours kept, when every part is known.
        let (out, changed, missed) = self.parts(s, false);
        if changed && !missed {
            return Some(out);
        }
        // A sentence coloured in parts ("Are you always on Full ^xE05030Life?") is known whole, without its
        // colours: its translation brings its own.
        if let Some(whole) = self.whole(s) {
            return Some(whole);
        }
        let (out, changed, _) = self.parts(s, true);
        changed.then_some(out)
    }

    /// `s` translated between its colour escapes and lines: the text, whether
    /// a part changed, and whether a part with letters stayed as it was
    /// (`note` notes those misses).
    fn parts(&self, s: &str, note: bool) -> (String, bool, bool) {
        let b = s.as_bytes();
        let mut out = String::with_capacity(s.len());
        let (mut changed, mut missed) = (false, false);
        let mut seg_start = 0;
        let mut i = 0;
        let mut flush = |out: &mut String, seg: &str| {
            for (n, line) in seg.split('\n').enumerate() {
                if n > 0 {
                    out.push('\n');
                }
                match if note { self.segment(line) } else { self.lookup(line) } {
                    Some(t) => {
                        changed = true;
                        out.push_str(&t);
                    }
                    None => {
                        missed |= line.bytes().any(|c| c.is_ascii_alphabetic());
                        out.push_str(line);
                    }
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
        (out, changed, missed)
    }
}

/// The length of the value range `b` starts with, as POB's unique items
/// write them: "(1-2)", "(0.4-0.5)", "(-10-10)".
fn range_len(b: &[u8]) -> Option<usize> {
    fn number(b: &[u8], mut i: usize) -> Option<usize> {
        if b.get(i) == Some(&b'-') {
            i += 1;
        }
        let digits = b[i.min(b.len())..].iter().take_while(|c| c.is_ascii_digit()).count();
        if digits == 0 {
            return None;
        }
        i += digits;
        if b.get(i) == Some(&b'.') && b.get(i + 1).is_some_and(u8::is_ascii_digit) {
            i += 1 + b[i + 1..].iter().take_while(|c| c.is_ascii_digit()).count();
        }
        Some(i)
    }
    if b.first() != Some(&b'(') {
        return None;
    }
    let i = number(b, 1)?;
    if b.get(i) != Some(&b'-') {
        return None;
    }
    let i = number(b, i + 1)?;
    (b.get(i) == Some(&b')')).then_some(i + 1)
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
        if c == '#' && !text[i + 1..].starts_with('{') {
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

    /// Text POB builds around known words, as the screens show it.
    #[test]
    fn built_text() {
        let d = Dictionary::load("zh-rCN");
        assert_eq!(d.translate("Current build:  My Build").as_deref(), Some("当前 BD:  My Build"));
        assert_eq!(d.translate("^7Version: 2.68.1").as_deref(), Some("^7版本: 2.68.1"));
        assert_eq!(d.translate("[3.27] Default").as_deref(), Some("[3.27] 默认"));
        assert_eq!(d.translate("1 Mirage Archers using Tornado Shot").as_deref(), Some("1 个幻影射手使用龙卷射击"));
        assert_eq!(d.translate("Convert all trees to 3.30").as_deref(), Some("全部转换为 3.30"));
        assert_eq!(d.translate("Level:").as_deref(), Some("等级:"));
    }

    /// The Items and Calcs tabs and the tree's tooltips: item names, lists, slots and stat changes.
    #[test]
    fn items_lists_and_changes() {
        let d = Dictionary::load("zh-rCN");
        assert_eq!(d.translate("^xAF6025Hyrri's Truth, Jade Amulet").as_deref(), Some("^xAF6025西里的真相, 翠玉护身符"));
        assert_eq!(d.translate("My Rare, Imperial Bow").as_deref(), Some("My Rare, 帝国之弓"));
        assert_eq!(d.translate("Arctic Armour, Grace, Precision, Steelskin").as_deref(), Some("极地装甲, 优雅, 精准, 钢铁之肤"));
        assert_eq!(d.translate("Flask 1:").as_deref(), Some("药剂 1:"));
        assert_eq!(d.translate("Socket #1:").as_deref(), Some("插槽 #1:"));
        assert_eq!(d.translate("+0.01 Attack Rate (+0.5%)").as_deref(), Some("+0.01 攻击速率 (+0.5%)"));
        assert_eq!(d.translate("-4,733.7 Average Damage (-6.2%)").as_deref(), Some("-4,733.7 平均伤害 (-6.2%)"));
        assert_eq!(d.translate("+1% Phys. Damage Reduction").as_deref(), Some("+1% 物理伤害减免"));
        assert_eq!(d.translate("Double click an item, or copy one from the game"), None);
        // A bullet of a list of tips, known without its "- ".
        assert_eq!(d.translate("- Ctrl + Click to enable/disable socket groups.").as_deref(), Some("- Ctrl+单击以启用/禁用插槽组。"));
        assert_eq!(d.translate("- Frenzy"), Some("- 狂怒".into()));
        // A disabled socket group's label.
        assert_eq!(d.translate("Tornado Shot, Frenzy (Disabled)").as_deref(), Some("龙卷射击, 狂怒 ^9(禁用)"));
        assert_eq!(d.translate("-Frenzy"), None);
    }

    #[test]
    fn wrapped_labelled_joined() {
        let mut d = dict();
        d.insert("Guard".into(), "护卫".into());
        d.insert("{0} using {1}".into(), "{0}使用{1}".into());
        assert_eq!(d.translate(" (Guard)").as_deref(), Some(" (护卫)"));
        assert_eq!(d.translate("Life:  Guard").as_deref(), Some("生命:  护卫"));
        assert_eq!(d.translate("Life:  Someone").as_deref(), Some("生命:  Someone"));
        assert_eq!(d.translate("Life using Guard").as_deref(), Some("生命使用护卫"));
        assert_eq!(d.translate("Life using Mana"), None);
        assert_eq!(d.translate("Mana:  Guard"), None);
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

    /// The Calcs tab's breakdowns: trigger rates, ignite and the mod table.
    #[test]
    fn calcs_breakdowns() {
        let d = Dictionary::load("zh-rCN");
        let t = |s: &str| d.translate(s);
        assert_eq!(t("Tornado Shot has no base cooldown or cooldown override").as_deref(), Some("龙卷射击没有基础冷却时间或冷却时间覆盖值"));
        assert_eq!(t("0.50 ^8(base cooldown of Manaforged Arrows)").as_deref(), Some("0.50 ^8(法铸箭矢（辅）的基础冷却时间)"));
        assert_eq!(t("0.50 ^8(base cooldown of My Skill)").as_deref(), Some("0.50 ^8(My Skill的基础冷却时间)"));
        assert_eq!(t("= 0.4762 ^8(final cooldown of trigger)").as_deref(), Some("= 0.4762 ^8(触发技能的最终冷却时间)"));
        assert_eq!(t("0.495 ^8(adjusted for server tick rate)").as_deref(), Some("0.495 ^8(按服务器 tick 率调整)"));
        assert_eq!(t("^8(extra ICDR of 3% would reach next breakpoint)").as_deref(), Some("^8(再提高 3% 冷却回复速度可达下一档)"));
        assert_eq!(t("Trigger rate:").as_deref(), Some("触发速率:"));
        assert_eq!(t("Guard Absorb Rate").as_deref(), Some("护卫吸收比例"));
        assert_eq!(t("Freeze Immune").as_deref(), Some("免疫冰冻"));
        assert_eq!(t("Avoid Bleed").as_deref(), Some("避免流血"));
        assert_eq!(t("True").as_deref(), Some("是"));
        assert_eq!(
            t("^8min combined sources + (max combined sources - min combined sources) * average ignite roll").as_deref(),
            Some("^8最小合计来源 + (最大合计来源 - 最小合计来源) * 平均点燃掷骰")
        );
        assert_eq!(t("Average Ignite DPS:").as_deref(), Some("平均点燃 DPS:"));
        assert_eq!(t("98.71% of Maximum Ignite DPS").as_deref(), Some("最大点燃 DPS 的 98.71%"));
        assert_eq!(t("DPS Range:").as_deref(), Some("DPS 范围:"));
        assert_eq!(t("0 to 616 ^8(Ignite DPS Range)").as_deref(), Some("0 至 616 ^8(点燃 DPS 范围)"));
        // Numbers with POB's thousands separators.
        assert_eq!(t("^75,566 to 23,059").as_deref(), Some("^75,566 至 23,059"));
        assert_eq!(t("532 to 1,654").as_deref(), Some("532 至 1,654"));
        assert_eq!(t("1,2 to 3"), None);
        assert_eq!(t("has no base cooldown"), None);
    }

    #[test]
    fn named() {
        let mut d = dict();
        d.insert("{name} has no base cooldown".into(), "{name}没有基础冷却时间".into());
        assert_eq!(d.translate("Life has no base cooldown").as_deref(), Some("生命没有基础冷却时间"));
        assert_eq!(d.translate("Foo Bar has no base cooldown").as_deref(), Some("Foo Bar没有基础冷却时间"));
        assert_eq!(d.translate(" has no base cooldown"), None);
    }

    #[test]
    fn deltas_with_units() {
        let mut d = dict();
        d.insert("AoE Radius:".into(), "范围效果半径:".into());
        assert_eq!(d.translate("-0.5m AoE Radius").as_deref(), Some("-0.5m 范围效果半径"));
        assert_eq!(d.translate("-0.5x AoE Radius"), None);
    }

    /// The Items tab's tooltips: unique mods with value ranges, supports
    /// granted by items, and the lines POB writes around an item.
    #[test]
    fn item_tooltips() {
        let d = Dictionary::load("zh-rCN");
        let t = |s: &str| d.translate(s);
        assert_eq!(t("Adds (1-2) to (3-4) Fire Damage to Spells and Attacks").as_deref(), Some("攻击和法术附加 (1-2) - (3-4) 基础火焰伤害"));
        assert_eq!(t("Adds 1 to 3 Fire Damage to Spells and Attacks").as_deref(), Some("攻击和法术附加 1 - 3 基础火焰伤害"));
        assert_eq!(t("(100-120)% increased Physical Damage").as_deref(), Some("物理伤害提高 (100-120)%"));
        assert_eq!(t("+(30-50) to maximum Life").as_deref(), Some("+(30-50) 最大生命"));
        assert_eq!(t("+(20-30)% to Fire Resistance").as_deref(), Some("火焰抗性 +(20-30)%"));
        assert_eq!(t("Reflects (71-90) Physical Damage to Melee Attackers").as_deref(), Some("反射 (71-90) 物理伤害给近战攻击者"));
        assert_eq!(t("(-10-10)% increased Attack Speed").as_deref(), Some("攻击速度提高 (-10-10)%"));
        assert_eq!(t("(0.4-0.5)% of Physical Attack Damage Leeched as Life").as_deref(), Some("物理攻击伤害的 (0.4-0.5)% 会转化为生命偷取"));
        assert_eq!(t("Socketed Gems are Supported by Level 12 Fortify Support").as_deref(), Some("插入的宝石被 12 级的护体辅助"));
        assert_eq!(t("Socketed Gems are Supported by Level (10-15) Blind Support").as_deref(), Some("此物品上的技能石受到 (10-15) 级的 盲目 辅助"));
        assert_eq!(t("Socketed Gems are Supported by Level 12 Nonsense Support"), None);
        assert_eq!(t("^xFFFF30Variant: Current (4 variants)").as_deref(), Some("^xFFFF30变种: 当前 (共 4 个变种)"));
        assert_eq!(t("^x8888FFSource: Drops from ^xAF6025Aul, the Crystal King^x8888FF").as_deref(), Some("^x8888FF来源: 由 Aul, the Crystal King 掉落"));
        assert_eq!(t("(replacing ").as_deref(), Some("(替换 "));
        assert_eq!(t("^x7F7F7FWeapon Range: ^x33FF771.1 ^x7F7F7Fmetres").as_deref(), Some("^x7F7F7F武器范围: ^x33FF771.1 ^x7F7F7F米"));
        assert_eq!(t("^x7F7F7FLimited to: ^71 Historic").as_deref(), Some("^x7F7F7F仅限: ^71 史实"));
        assert_eq!(t("My Quiver, Primal Arrow Quiver").as_deref(), Some("My Quiver, 原始箭袋"));
        // A range only in brackets of its own, and only in a known line.
        assert_eq!(t("We met (1-2) people"), None);
        assert_eq!(t("Drops from"), None);
    }
}
