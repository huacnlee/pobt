//! Tencent's Path of Exile 2 characters, which its site does not give: from a
//! WeGame share link (`https://www.wegame.com.cn/helper/poe2/#/share/<code>`),
//! read as its share page reads it, with JSON POSTs to WeGame's API. The
//! answers have the layout of Path of Exile 2's character API, their text in
//! Chinese: here it goes back to English for Path of Building 2. Names of
//! bases, uniques and gems by their art (their icon's path, the same in every
//! language; `scripts/tencent-stats.mjs poe2`); mods by Tencent's trade list
//! joined with the English one. What art leaves open (bases sharing theirs,
//! a unique's base) Path of Building 2's data settles (`export.lua`).

use std::{collections::HashMap, sync::OnceLock};

use base64::{Engine, engine::general_purpose::STANDARD_NO_PAD};
use serde_json::{Value, json};

use crate::reverse::Reverse;

const API: &str = "https://www.wegame.com.cn/api/v1/wegame.pallas.poe2.Profile/";
/// What the share page says it is.
const FROM: &str = "poe2_helper";

/// The share code of a WeGame share link, or the code itself.
pub fn share_code(text: &str) -> Option<String> {
    let t = text.trim().trim_end_matches('/');
    let code = t.rsplit_once("#/share/").map_or(t, |(_, c)| c);
    let ok = code.len() >= 16
        && code
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    ok.then(|| code.to_string())
}

fn post(method: &str, body: &Value) -> Result<Value, String> {
    log::info!("wegame: POST {method}");
    let r = ureq::post(&format!("{API}{method}"))
        .timeout(std::time::Duration::from_secs(30))
        .set("Content-Type", "application/json")
        .send_string(&body.to_string());
    let v: Value = match r {
        Ok(r) => r
            .into_string()
            .ok()
            .and_then(|b| serde_json::from_str(&b).ok())
            .ok_or("network: not JSON")?,
        Err(ureq::Error::Status(code, _)) => return Err(format!("network: HTTP {code}")),
        Err(e) => return Err(format!("network: {e}")),
    };
    match v["result"]["error_code"].as_i64() {
        Some(0) => Ok(v),
        code => {
            log::warn!(
                "wegame: {method}: {code:?} {}",
                v["result"]["error_message"]
            );
            Err("shareExpired".into())
        }
    }
}

/// The shared character, as WeGame gives it: its `role` (`name`, `class_name`,
/// `level`, `openid`, `role_id`, `account_name`…).
pub fn role(code: &str) -> Result<Value, String> {
    let v = post(
        "GetRoleInfo",
        &json!({ "share_code": code, "area": 0, "from_src": FROM }),
    )?;
    v.get("role")
        .filter(|r| r.is_object())
        .cloned()
        .ok_or_else(|| "shareExpired".into())
}

/// The character as an entry of an account's list.
pub fn listed(role: &Value) -> Value {
    json!({
        "name": role["name"],
        "class": role["class_name"],
        "level": role["level"].as_u64().unwrap_or(1),
        "league": "",
        "lastLoginTime": role["last_login_time"].as_str().and_then(|s| s.parse::<u64>().ok()),
    })
}

/// The shared character in the layout of Path of Exile 2's character API,
/// in English as far as it goes, and the lines left in Chinese.
pub fn character(code: &str) -> Result<(Value, usize), String> {
    let role = role(code)?;
    let body = json!({
        "area": role["area"].as_i64().unwrap_or(0), "openid": role["openid"], "role_id": role["role_id"],
        "share_code": code, "from_src": FROM,
    });
    let equipment = post("GetEquipments", &body)?;
    let tree = post("GetTalentTree", &body)?;
    // Jewels and skills: without them, still the rest.
    let jewels = post("GetJewels", &body).unwrap_or_default();
    let skills = post("GetSkills", &body).unwrap_or_default();
    Ok(convert(&role, &equipment, &tree, &jewels, &skills))
}

/// Names by art: `(namespace, name)`s, `ITEM` a base, `UNIQUE`, `GEM`.
fn arts() -> &'static HashMap<String, Vec<(String, String)>> {
    static ARTS: OnceLock<HashMap<String, Vec<(String, String)>>> = OnceLock::new();
    ARTS.get_or_init(|| {
        let mut map: HashMap<String, Vec<(String, String)>> = HashMap::new();
        for (_, data) in crate::trs::files("zh-rCN/tencent-poe2/art") {
            let mut reader = csv::ReaderBuilder::new()
                .has_headers(false)
                .flexible(true)
                .from_reader(data.as_slice());
            for r in reader.records().flatten() {
                if let (Some(art), Some(ns), Some(name)) = (r.get(0), r.get(1), r.get(2)) {
                    map.entry(art.to_string())
                        .or_default()
                        .push((ns.to_string(), name.to_string()));
                }
            }
        }
        map
    })
}

/// Path of Exile 2's mods as Tencent words them, the other way.
fn reverse() -> &'static Reverse {
    static REV: OnceLock<Reverse> = OnceLock::new();
    REV.get_or_init(|| Reverse::load_only("zh-rCN/tencent-poe2"))
}

/// The art of an icon's address: its path, in the base64 JSON the address holds.
fn art(icon: &str) -> Option<String> {
    let part = icon.split("/image/").nth(1)?.split('/').next()?;
    let bytes = STANDARD_NO_PAD
        .decode(
            part.replace('-', "+")
                .replace('_', "/")
                .trim_end_matches('='),
        )
        .ok()?;
    let v: Value = serde_json::from_slice(&bytes).ok()?;
    v.get(2)?.get("f")?.as_str().map(str::to_string)
}

/// The English names of `namespace` with the art of `icon`.
fn names(icon: Option<&str>, namespace: &str) -> Vec<String> {
    let Some(art) = icon.and_then(art) else {
        return Vec::new();
    };
    arts()
        .get(&art)
        .into_iter()
        .flatten()
        .filter(|(ns, _)| ns == namespace)
        .map(|(_, n)| n.clone())
        .collect()
}

/// Tencent's markup as the text it shows: "[Fire|火焰]" as "火焰".
fn unmark(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find('[') {
        let Some(close) = rest[open..].find(']').map(|c| open + c) else {
            break;
        };
        out.push_str(&rest[..open]);
        let inner = &rest[open + 1..close];
        out.push_str(inner.rsplit_once('|').map_or(inner, |(_, shown)| shown));
        rest = &rest[close + 1..];
    }
    out.push_str(rest);
    out
}

fn has_chinese(s: &str) -> bool {
    s.chars().any(|c| c as u32 >= 0x2e80)
}

/// The names of the properties Path of Building 2 reads, by the type the API gives them.
fn property_name(kind: i64) -> Option<&'static str> {
    Some(match kind {
        5 => "Level",
        6 => "Quality",
        16 => "Armour",
        17 => "Evasion Rating",
        18 => "Energy Shield",
        25 => "Spirit",
        62 => "Level",
        63 => "Str",
        64 => "Dex",
        65 => "Int",
        _ => return None,
    })
}

/// An item's properties or requirements, those Path of Building 2 reads, named in English.
fn properties(list: Option<&Value>) -> Vec<Value> {
    let mut out = Vec::new();
    for p in list.and_then(Value::as_array).into_iter().flatten() {
        let name = unmark(p["name"].as_str().unwrap_or(""));
        let en = match p["type"].as_i64().and_then(property_name) {
            Some(en) => en,
            None if name == "仅限" => "Limited to",
            None if name.contains("范围") || name.contains("半径") => "Radius",
            None => continue,
        };
        // A gem's own level requirement ("等级(宝石)"), after the item's: not Path of Building's.
        if p["suffix"].is_string() {
            continue;
        }
        let mut p = p.clone();
        p["name"] = en.into();
        out.push(p);
    }
    out
}

/// Mod lines in English; those the dictionary does not have are counted, and left out.
fn mods(list: Option<&Value>, missed: &mut usize) -> Vec<Value> {
    let rev = reverse();
    let mut out = Vec::new();
    for m in list.and_then(Value::as_array).into_iter().flatten() {
        let text = m["description"].as_str().or(m.as_str()).unwrap_or("");
        for line in text.split('\n').map(str::trim).filter(|l| !l.is_empty()) {
            if !has_chinese(line) {
                out.push(Value::from(unmark(line)));
                continue;
            }
            match rev.english(line) {
                Some(en) => out.push(en.into()),
                None => {
                    log::info!("wegame: untranslated: {line}");
                    *missed += 1;
                }
            }
        }
    }
    out
}

/// A WeGame item in English: its base by its art (all the bases that share
/// it in `pobtBases`), a unique by its art too (its base settled in
/// `export.lua`), its mods by the dictionary.
fn item(src: &Value, missed: &mut usize) -> Option<Value> {
    let icon = src["icon"].as_str();
    let frame = src["frameType"].as_i64().unwrap_or(0);
    let mut out = json!({
        "id": src["id"], "inventoryId": src["inventoryId"], "x": src["x"].as_i64().unwrap_or(0), "y": src["y"].as_i64().unwrap_or(0),
        "frameType": frame, "rarity": src["rarity"], "ilvl": src["ilvl"].as_i64().unwrap_or(0),
        "corrupted": src["corrupted"].as_bool().unwrap_or(false), "identified": true,
        "name": "", "typeLine": "", "baseType": "",
        "properties": properties(src.get("properties")), "requirements": properties(src.get("requirements")),
    });
    if frame == 3 {
        let uniques = names(icon, "UNIQUE");
        let Some(first) = uniques.first() else {
            log::info!("wegame: unknown unique: {}", src["name"]);
            return None;
        };
        out["name"] = first.clone().into();
        out["pobtUniques"] = uniques.into();
    } else {
        let bases = names(icon, "ITEM");
        let Some(first) = bases.first() else {
            log::info!("wegame: unknown base: {}", src["typeLine"]);
            return None;
        };
        out["typeLine"] = first.clone().into();
        out["baseType"] = first.clone().into();
        if bases.len() > 1 {
            out["pobtBases"] = bases.into();
        }
        // A rare's name has no English: Path of Building shows it as it is.
        if frame == 2 {
            out["name"] = unmark(src["name"].as_str().unwrap_or("")).into();
        }
    }
    for list in [
        "implicitMods",
        "explicitMods",
        "enchantMods",
        "runeMods",
        "fracturedMods",
        "desecratedMods",
        "craftedMods",
    ] {
        let lines = mods(src.get(list), missed);
        if !lines.is_empty() {
            out[list] = lines.into();
        }
    }
    if let Some(sockets) = src.get("sockets") {
        out["sockets"] = sockets.clone();
    }
    // Runes and soul cores: their names; a jewel in an item, the whole of it.
    let socketed: Vec<Value> = src["socketedItems"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|s| s["frameType"].as_i64() != Some(4))
        .filter_map(|s| {
            if s["frameTypeId"] == "Currency" {
                let name = names(s["icon"].as_str(), "ITEM").into_iter().next()?;
                Some(json!({ "baseType": name, "typeLine": name, "socket": s["socket"] }))
            } else {
                let mut jewel = item(s, missed)?;
                jewel["socket"] = s["socket"].clone();
                Some(jewel)
            }
        })
        .collect();
    if !socketed.is_empty() {
        out["socketedItems"] = socketed.into();
    }
    Some(out)
}

/// A gem in English by its art, a support's tier by the numeral of its Chinese name ("范围扩大 II").
fn gem(src: &Value) -> Option<Value> {
    let gems = names(src["icon"].as_str(), "GEM");
    let zh = unmark(src["typeLine"].as_str().unwrap_or(""));
    let numeral = zh
        .rsplit_once(' ')
        .map(|(_, n)| n)
        .filter(|n| !n.is_empty() && n.chars().all(|c| matches!(c, 'I' | 'V' | 'X')));
    let name = match numeral {
        Some(n) => gems
            .iter()
            .find(|g| g.ends_with(&format!(" {n}")))
            .or(gems.first()),
        None => gems.first(),
    };
    let Some(name) = name else {
        log::info!("wegame: unknown gem: {zh}");
        return None;
    };
    let support = src["properties"].as_array().into_iter().flatten().any(|p| {
        p["name"]
            .as_str()
            .is_some_and(|n| n.contains("[SupportGem|"))
    });
    let supports: Vec<Value> = src["socketedItems"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(gem)
        .collect();
    Some(json!({
        "typeLine": name, "baseType": name, "support": support, "corrupted": src["corrupted"].as_bool().unwrap_or(false),
        "properties": properties(src.get("properties")), "socketedItems": supports,
    }))
}

/// A jewel radius in game units (Path of Building's times 1.2), as the property Path of Building reads.
fn radius(units: i64) -> Option<&'static str> {
    Some(match units {
        1200 => "Small",
        1380 => "Medium",
        1560 => "Large",
        1800 => "Very Large",
        _ => return None,
    })
}

const ATTRIBUTES: &[(&str, &str)] = &[
    ("力量", "Strength"),
    ("敏捷", "Dexterity"),
    ("智慧", "Intelligence"),
];

fn convert(
    role: &Value,
    equipment: &Value,
    tree: &Value,
    jewels: &Value,
    skills: &Value,
) -> (Value, usize) {
    let mut missed = 0;
    let league = equipment["equipments"][0]["league"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let equipment: Vec<Value> = equipment["equipments"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|i| item(i, &mut missed))
        .collect();

    let t = &tree["talent_tree"];
    let mut overrides = serde_json::Map::new();
    for (node, info) in t["skill_overrides"].as_object().into_iter().flatten() {
        let name = unmark(info["name"].as_str().unwrap_or(""));
        if let Some((_, en)) = ATTRIBUTES.iter().find(|(zh, _)| *zh == name) {
            overrides.insert(node.clone(), json!({ "name": en }));
        }
    }
    let quest: Vec<Value> = t["quest_stats"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|q| {
            let line = unmark(q.as_str()?);
            if let Some(n) = line.strip_suffix("个毁面首领").map(str::trim) {
                return Some(format!("{n} Broken Boss Faces").into());
            }
            reverse().english(&line).map(Value::from)
        })
        .collect();

    // The jewels in the tree: a JSON string of `[{ socket_id: "PassiveJewel_<x>", jewel }]`.
    let entries: Vec<Value> = match &jewels["jewel_data"] {
        Value::String(s) => serde_json::from_str(s).unwrap_or_default(),
        Value::Array(a) => a.clone(),
        _ => Vec::new(),
    };
    let mut jewel_items = Vec::new();
    for e in &entries {
        let j = &e["jewel"];
        let Some(x) = e["socket_id"]
            .as_str()
            .and_then(|s| s.strip_prefix("PassiveJewel_"))
            .and_then(|n| n.parse::<i64>().ok())
        else {
            continue;
        };
        let frame = j["rarity"].as_i64().unwrap_or(0);
        let lines: Vec<Value> = j["mod_descriptions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|m| m["values"][0].as_str())
            .map(Value::from)
            .collect();
        let src = json!({
            "id": j["id"], "inventoryId": "PassiveJewels", "x": x, "frameType": frame, "icon": j["icon"],
            "name": if frame == 2 { j["display_name"].clone() } else { "".into() }, "ilvl": j["level"], "explicitMods": lines,
        });
        let Some(mut jewel) = item(&src, &mut missed) else {
            continue;
        };
        if let Some(r) = t["jewel_data"][x.to_string()]["radius"]
            .as_i64()
            .and_then(radius)
        {
            jewel["properties"]
                .as_array_mut()
                .unwrap()
                .push(json!({ "name": "Radius", "values": [[r, 0]], "displayMode": 0 }));
        }
        jewel_items.push(jewel);
    }

    let skills: Vec<Value> = skills["skills"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(gem)
        .collect();
    let char = json!({
        "name": role["name"], "class": role["class_name"], "level": role["level"].as_u64().unwrap_or(1), "league": league,
        "equipment": equipment, "jewels": jewel_items, "skills": skills,
        "passives": {
            "hashes": t["hashes"], "specialisations": t["specialisations"], "skill_overrides": overrides,
            "jewel_data": t["jewel_data"], "quest_stats": quest,
        },
    });
    (char, missed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn share_codes() {
        let code = "5FvrgToLOkFVVZ6TYZlWPCvw29vd0tgHZ-Dv9E4QFdRIrG4hvKgMDIMHSXMPW33b";
        assert_eq!(
            share_code(&format!(
                "https://www.wegame.com.cn/helper/poe2/#/share/{code}"
            ))
            .as_deref(),
            Some(code)
        );
        assert_eq!(share_code(&format!(" {code}/ ")).as_deref(), Some(code));
        assert_eq!(share_code("https://example.com/x"), None);
    }

    #[test]
    fn names_by_art() {
        let icon = "https://poecdn.game.qq.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQmVsdHMvVW5pcXVlcy9NYWdlYmxvb2QiLCJ3IjoyLCJoIjoxLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/x/Mageblood.png";
        assert_eq!(
            art(icon).as_deref(),
            Some("2DItems/Belts/Uniques/Mageblood")
        );
        assert_eq!(names(Some(icon), "UNIQUE"), ["Mageblood"]);
        assert_eq!(unmark("[Attack|攻击]速度提高 2%"), "攻击速度提高 2%");
    }

    /// A support's tier by its numeral, its art shared by all tiers.
    #[test]
    fn support_tiers() {
        let icon = "https://x/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvR2Vtcy9OZXcvTmV3U3VwcG9ydC9JbmNyZWFzZWRBcmVhT2ZFZmZlY3RTdXBwb3J0R2VtIn1d/y/z.png";
        let g = gem(&json!({ "typeLine": "范围扩大 II", "icon": icon, "properties": [{ "name": "[SupportGem|辅助]" }] })).unwrap();
        assert_eq!(g["typeLine"], "Magnified Area II");
        assert_eq!(g["support"], true);
    }

    /// The character of a real WeGame share link in `POBT_TEST_WEGAME_SHARE`:
    /// what is left in Chinese, and it made a build by the Path of Building 2
    /// of `POB2_DIR`. Ignored by default: it goes to WeGame.
    #[test]
    #[ignore = "uses a real WeGame share link"]
    fn live_wegame_share() {
        let Some(code) = std::env::var("POBT_TEST_WEGAME_SHARE")
            .ok()
            .and_then(|s| share_code(&s))
        else {
            eprintln!("POBT_TEST_WEGAME_SHARE not set: skipped");
            return;
        };
        let (char, missed) = character(&code).unwrap();
        eprintln!(
            "{} ({}): {} items, {} jewels, {} skills, {missed} lines untranslated",
            char["name"],
            char["class"],
            char["equipment"].as_array().unwrap().len(),
            char["jewels"].as_array().unwrap().len(),
            char["skills"].as_array().unwrap().len()
        );
        let text = char.to_string();
        for line in text
            .split('"')
            .filter(|s| s.contains('#') || s.contains("{0}") || s.contains("{1}"))
        {
            eprintln!("unfilled: {line}");
        }
        let Some(dir) = std::env::var_os("POB2_DIR") else {
            return;
        };
        let out = crate::host::export(
            dir.into(),
            "WeGame".into(),
            char.to_string(),
            String::new(),
            String::new(),
            |s| eprintln!("step: {s}"),
        )
        .unwrap();
        for want in ["Mageblood", "Twister"] {
            eprintln!("{want}: {}", out.xml.contains(want));
        }
        std::fs::write(std::env::temp_dir().join("pobt-wegame.xml"), &out.xml).unwrap();
    }
}
