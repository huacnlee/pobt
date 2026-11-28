//! Item and gem names as the game itself writes them, for finding them on its market: in Simplified Chinese, Path of
//! Exile's are Tencent's (`trs/zh-rCN/tencent/game.csv`, `scripts/tencent-game.mjs`), which POB's own translation
//! words differently here and there ("附加火焰伤害(辅)"); anything else is the translation of POB's screens.

use std::collections::HashMap;
use std::sync::OnceLock;

static TENCENT: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Tencent's names by their English, read once: the first row of an English wins.
fn tencent() -> &'static HashMap<String, String> {
    TENCENT.get_or_init(|| {
        let mut names = HashMap::new();
        for (_, data) in crate::trs::files("zh-rCN/tencent").into_iter().filter(|(name, _)| name == "game.csv") {
            let mut reader = csv::ReaderBuilder::new().has_headers(false).flexible(true).from_reader(data.as_slice());
            for record in reader.records().flatten() {
                // a row with holes (its third column) is a mod's template, not a name
                if record.len() != 2 {
                    continue;
                }
                let en = record[0].trim_start_matches('\u{feff}').trim();
                let zh = record[1].trim();
                if !en.is_empty() && !zh.is_empty() {
                    names.entry(en.to_string()).or_insert_with(|| zh.to_string());
                }
            }
        }
        names
    })
}

/// The name the game of `game` (`"poe1"`, `"poe2"`) shows in `language` (a `trs` folder, "" for English) for
/// `english`, an item's or a gem's; `translate` is the translation of POB's screens, for what Tencent's list has not.
pub fn game_name(game: &str, language: &str, english: &str, translate: impl Fn(&str) -> Option<String>) -> String {
    if language.is_empty() {
        return english.to_string();
    }
    if game == "poe1" && language == "zh-rCN" {
        if let Some(zh) = tencent().get(english) {
            return zh.clone();
        }
    }
    translate(english).unwrap_or_else(|| english.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tencent_names_first() {
        let none = |_: &str| None;
        assert_eq!(game_name("poe1", "zh-rCN", "Added Fire Damage Support", none), "附加火焰伤害(辅)");
        assert_eq!(game_name("poe1", "zh-rCN", "Leather Belt", none), "皮革腰带");
        // English, and Path of Exile 2, are not Tencent's list
        assert_eq!(game_name("poe1", "", "Leather Belt", none), "Leather Belt");
        assert_eq!(game_name("poe2", "zh-rCN", "Leather Belt", |_| Some("POB".into())), "POB");
        // what the list has not, the screens' translation names
        assert_eq!(game_name("poe1", "zh-rCN", "No Such Thing", |_| Some("译名".into())), "译名");
    }
}
