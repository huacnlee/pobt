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
    templates: HashMap<String, (String, Vec<usize>)>,
}

/// Full-width forms as ASCII ("（辅）" as "(辅)"), with no whitespace: Tencent's
/// text and the dictionary's differ in both.
fn normalize(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace() && *c != '\u{3000}')
        .map(|c| match c {
            '\u{ff01}'..='\u{ff5e}' => char::from_u32(c as u32 - 0xfee0).unwrap_or(c),
            '\u{3001}' => ',',
            c => c,
        })
        .collect()
}

/// The Chinese of a template made a key: `{N}` and `#` become holes; and the
/// number each hole stands for.
fn template_key(zh: &str) -> Option<(String, Vec<usize>)> {
    let mut key = String::with_capacity(zh.len());
    let mut order = Vec::new();
    let mut sequential = 0;
    let mut rest = zh;
    while let Some(c) = rest.chars().next() {
        if c == '{' {
            let digits = rest[1..].chars().take_while(char::is_ascii_digit).count();
            if digits > 0 && rest[1 + digits..].starts_with('}') {
                key.push(HOLE);
                order.push(rest[1..1 + digits].parse().ok()?);
                rest = &rest[digits + 2..];
                continue;
            }
        }
        if c == '#' {
            key.push(HOLE);
            order.push(sequential);
            sequential += 1;
        } else {
            key.push(c);
        }
        rest = &rest[c.len_utf8()..];
    }
    (!order.is_empty()).then_some((key, order))
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
                out.push_str((*nums.get(n)?)?);
                rest = &rest[digits + 2..];
                continue;
            }
        }
        if c == '#' {
            out.push_str((*nums.get(sequential)?)?);
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
        let mut by_index = vec![None; order.iter().max().map_or(0, |m| m + 1)];
        for (hole, &n) in order.iter().enumerate() {
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
