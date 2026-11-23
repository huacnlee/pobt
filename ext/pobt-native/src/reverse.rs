//! The dictionary the other way: Chinese back to English, for the items
//! Tencent's site gives in Chinese, which Path of Building reads in English
//! only. Built from the same `en,zh` CSV files as [`crate::translate`].

use std::collections::HashMap;

const HOLE: char = '\u{1}';

/// The files whose words items use, read first: the first English for a
/// Chinese text wins.
const FIRST: &[&str] = &[
    "POBT-items.csv",
    "statDescriptions.csv",
    "Uniques.txt.csv",
    "Items_",
    "Gems_data.txt.csv",
    "Tatto",
    "tree_",
    "passiveTree.csv",
];

fn rank(name: &str) -> usize {
    FIRST.iter().position(|f| name.starts_with(f)).unwrap_or(FIRST.len())
}

#[derive(Default)]
pub struct Reverse {
    exact: HashMap<String, String>,
    /// Key: the Chinese with each number as a hole; value: the English, and
    /// per hole of the Chinese, the index of the number it holds.
    templates: HashMap<String, (String, Vec<Option<usize>>)>,
    /// Support gems by the name the game gives them in Chinese, without "(辅)".
    gems: HashMap<String, String>,
}

/// Tencent's markup as the text it shows: "[PlayerItemRarity|物品稀有度]" as
/// "物品稀有度", "[Thread]" as "Thread".
fn unmark(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find('[') {
        let Some(close) = rest[open..].find(']').map(|c| open + c) else { break };
        out.push_str(&rest[..open]);
        let inner = &rest[open + 1..close];
        out.push_str(inner.rsplit_once('|').map_or(inner, |(_, shown)| shown));
        rest = &rest[close + 1..];
    }
    out.push_str(rest);
    out
}

/// Full-width forms as ASCII ("（辅）" as "(辅)"), with no whitespace: Tencent's
/// text and the dictionary's differ in both; and no markup.
fn normalize(s: &str) -> String {
    unmark(s)
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '\u{3000}')
        .map(|c| match c {
            '\u{ff01}'..='\u{ff5e}' => char::from_u32(c as u32 - 0xfee0).unwrap_or(c),
            '\u{3001}' => ',',
            c => c,
        })
        .collect()
}

/// The Chinese of a template made a key: `{N}` and `#` become holes, and so
/// do the numbers it writes out ("获得 1 充能"), as an item's numbers do; and
/// per hole, the number of the English it stands for (none for those written
/// out, which the English does not have).
fn template_key(zh: &str) -> Option<(String, Vec<Option<usize>>)> {
    let mut key = String::with_capacity(zh.len());
    let mut order = Vec::new();
    let mut sequential = 0;
    let mut holes = false;
    let mut rest = zh;
    while let Some(c) = rest.chars().next() {
        // "+#%": the sign is the number's, which an item's may have the other way ("-10%").
        if c == '+' && rest[1..].starts_with(['#', '{']) {
            rest = &rest[1..];
            continue;
        }
        if c == '{' {
            let digits = rest[1..].chars().take_while(char::is_ascii_digit).count();
            if digits > 0 && rest[1 + digits..].starts_with('}') {
                key.push(HOLE);
                order.push(Some(rest[1..1 + digits].parse().ok()?));
                holes = true;
                rest = &rest[digits + 2..];
                continue;
            }
        }
        if c.is_ascii_digit() {
            let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
            let decimals = match rest.as_bytes()[digits..] {
                [b'.', d, ..] if d.is_ascii_digit() => 1 + rest[digits + 1..].bytes().take_while(u8::is_ascii_digit).count(),
                _ => 0,
            };
            key.push(HOLE);
            order.push(None);
            rest = &rest[digits + decimals..];
            continue;
        }
        if c == '#' {
            key.push(HOLE);
            order.push(Some(sequential));
            sequential += 1;
            holes = true;
        } else {
            key.push(c);
        }
        rest = &rest[c.len_utf8()..];
    }
    holes.then_some((key, order))
}

/// `n` after `out`: a signed number in place of the "+" before its hole ("+#%" with "-10" as "-10%").
fn push_number(out: &mut String, n: &str) {
    if n.starts_with(['+', '-']) && out.ends_with('+') {
        out.pop();
    }
    out.push_str(n);
}

/// The English template `en` with its holes filled: `{N}` by `nums[N]`, `#`
/// by the next number.
fn fill(en: &str, nums: &[Option<&str>]) -> Option<String> {
    let mut out = String::with_capacity(en.len() + 8);
    let mut sequential = 0;
    let mut rest = en;
    while let Some(c) = rest.chars().next() {
        if c == '{' {
            let digits = rest[1..].chars().take_while(char::is_ascii_digit).count();
            if digits > 0 && rest[1 + digits..].starts_with('}') {
                let n: usize = rest[1..1 + digits].parse().ok()?;
                push_number(&mut out, (*nums.get(n)?)?);
                rest = &rest[digits + 2..];
                continue;
            }
        }
        if c == '#' {
            push_number(&mut out, (*nums.get(sequential)?)?);
            sequential += 1;
        } else {
            out.push(c);
        }
        rest = &rest[c.len_utf8()..];
    }
    Some(out)
}

impl Reverse {
    /// The reverse of `trs/<language>`.
    pub fn load(language: &str) -> Self {
        let mut files = crate::trs::files(language);
        files.sort_by(|a, b| rank(&a.0).cmp(&rank(&b.0)).then_with(|| a.0.cmp(&b.0)));
        // The mods as Tencent words them now (`scripts/tencent-stats.mjs`), before all: in a folder of their own,
        // which the translation of POB's screens does not read.
        files.splice(0..0, crate::trs::files(&format!("{language}/tencent")));
        let mut rev = Reverse::default();
        for (_, data) in files {
            let mut reader = csv::ReaderBuilder::new().has_headers(false).flexible(true).from_reader(data.as_slice());
            for record in reader.byte_records().flatten() {
                if record.len() < 2 {
                    continue;
                }
                let en = String::from_utf8_lossy(&record[0]).trim_start_matches('\u{feff}').trim().to_string();
                let zh = String::from_utf8_lossy(&record[1]).trim().to_string();
                rev.insert(en, &zh);
            }
        }
        rev
    }

    fn insert(&mut self, en: String, zh: &str) {
        if en.is_empty() || zh.is_empty() || en.starts_with("##") || en.contains("{name}") || en == zh {
            return;
        }
        let zh = normalize(zh);
        // "Socketed Gems are Supported by Level {0} Pierce": the support's name as the game writes it, which its
        // own entry may not ("穿透(辅)", "投射物穿透").
        // Tencent's: "镶嵌的宝石被 # 级 齐射(辅) 辅助".
        let gem = en.strip_prefix("Socketed Gems are Supported by Level {0} ").or_else(|| en.strip_prefix("Socketed Gems are Supported by Level # "));
        if let Some(gem) = gem {
            let name = zh.split_once('级').and_then(|(_, rest)| rest.strip_suffix("辅助"));
            let name = name.map(|n| n.strip_prefix('的').unwrap_or(n)).map(|n| n.strip_suffix("(辅)").unwrap_or(n));
            if let Some(name) = name.filter(|n| !n.is_empty()) {
                self.gems.entry(name.to_string()).or_insert_with(|| gem.to_string());
            }
        }
        if let Some((key, order)) = template_key(&zh) {
            self.templates.entry(key).or_insert((en.clone(), order));
        }
        self.exact.entry(zh).or_insert(en);
    }

    /// The English of one line of Chinese, if the dictionary has it.
    pub fn english(&self, zh: &str) -> Option<String> {
        let t = normalize(zh);
        if t.is_empty() {
            return None;
        }
        if let Some(en) = self.exact.get(&t) {
            return Some(en.clone());
        }
        self.template(&t, true).or_else(|| self.template(&t, false))
    }

    /// The English of a gem's name: as `english`, or a support's name with
    /// its "(辅)" or without it.
    pub fn gem(&self, zh: &str) -> Option<String> {
        let t = normalize(zh);
        let bare = t.strip_suffix("(辅)").unwrap_or(&t);
        self.english(zh)
            .or_else(|| self.exact.get(bare).cloned())
            .or_else(|| self.gems.get(bare).cloned())
            .or_else(|| self.exact.get(&format!("{bare}(辅)")).cloned())
    }

    /// `t` matched as a template, its numbers taken with their sign when
    /// `signed` ("+42 最大生命"), or not ("附加 10-20 基础火焰伤害").
    fn template(&self, t: &str, signed: bool) -> Option<String> {
        let b = t.as_bytes();
        let mut key = String::with_capacity(t.len());
        let mut nums: Vec<&str> = Vec::new();
        let mut i = 0;
        while i < b.len() {
            let start = i;
            let mut j = i;
            if signed && (b[j] == b'+' || b[j] == b'-') && b.get(j + 1).is_some_and(u8::is_ascii_digit) {
                j += 1;
            }
            if b[j].is_ascii_digit() {
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                if j + 1 < b.len() && b[j] == b'.' && b[j + 1].is_ascii_digit() {
                    j += 1;
                    while j < b.len() && b[j].is_ascii_digit() {
                        j += 1;
                    }
                }
                nums.push(&t[start..j]);
                key.push(HOLE);
                i = j;
                continue;
            }
            let c = t[i..].chars().next()?;
            key.push(c);
            i += c.len_utf8();
        }
        if nums.is_empty() {
            return None;
        }
        let (en, order) = self.templates.get(&key)?;
        if order.len() != nums.len() {
            return None;
        }
        // The numbers by the index the English gives them.
        let mut by_index = vec![None; order.iter().flatten().max().map_or(0, |m| m + 1)];
        for (hole, n) in order.iter().enumerate() {
            // A number the Chinese writes out is not in the English.
            let Some(n) = *n else { continue };
            by_index[n] = Some(nums[hole]);
        }
        fill(en, &by_index)
    }
}

#[cfg(test)]
mod tests {
    use super::Reverse;

    fn rev() -> Reverse {
        let mut r = Reverse::default();
        r.insert("{0} to maximum Life".into(), "{0} 最大生命");
        r.insert("Adds {0} to {1} Fire Damage".into(), "附加 {0} - {1} 基础火焰伤害");
        r.insert("{0}% increased maximum Life".into(), "生命上限提高 {0}%");
        r.insert("Added Fire Damage".into(), "附加火焰伤害(辅)");
        r.insert("Swap {1} and {0}".into(), "{1} 换 {0}");
        r
    }

    #[test]
    fn exact_and_templates() {
        let r = rev();
        assert_eq!(r.english("+42 最大生命").as_deref(), Some("+42 to maximum Life"));
        assert_eq!(r.english("+42最大生命").as_deref(), Some("+42 to maximum Life"));
        assert_eq!(r.english("附加 10 - 20 基础火焰伤害").as_deref(), Some("Adds 10 to 20 Fire Damage"));
        assert_eq!(r.english("生命上限提高 12.5%").as_deref(), Some("12.5% increased maximum Life"));
        assert_eq!(r.english("附加火焰伤害（辅）").as_deref(), Some("Added Fire Damage"));
        assert_eq!(r.english("2 换 1").as_deref(), Some("Swap 2 and 1"));
        assert_eq!(r.english("未知词缀 5"), None);
    }

    /// The real dictionary turns a few of Tencent's lines back.
    #[test]
    fn real_dictionary() {
        let r = Reverse::load("zh-rCN");
        assert!(r.exact.len() > 10000, "{} entries", r.exact.len());
        assert_eq!(r.english("瓦尔法衣").as_deref(), Some("Vaal Regalia"));
        assert_eq!(r.english("猎首").as_deref(), Some("Headhunter"));
        assert_eq!(r.english("+80 最大生命").as_deref(), Some("+80 to maximum Life"));
    }
}
