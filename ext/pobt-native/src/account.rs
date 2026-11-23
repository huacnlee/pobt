//! Characters from an account on Path of Exile's site, or Tencent's, made
//! builds: their list, their items and passive tree from the site's
//! `character-window` API, imported by POB's own Import tab on a POB with no
//! window (`host::export`), and given back as a build code or saved among
//! POB's builds. Tencent's site needs the account's `POESESSID` cookie, and
//! gives items in Chinese, which go back to English by `reverse`. The
//! accounts used are kept in `%APPDATA%\pobt\accounts.json`.

use std::{
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::reverse::Reverse;

/// An account: its realm (`pc`, `xbox`, `sony` or `tencent`), name, and
/// `POESESSID`, which a private profile and Tencent need.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Account {
    pub realm: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub sessid: String,
}

impl Account {
    fn tencent(&self) -> bool {
        self.realm == "tencent"
    }

    fn host(&self) -> &'static str {
        if self.tencent() { "https://poe.game.qq.com/" } else { "https://www.pathofexile.com/" }
    }

    /// The query of a `character-window` call for this account.
    fn query(&self, character: Option<&str>) -> String {
        let mut q = format!("accountName={}", encode(&self.name));
        if let Some(c) = character {
            q += &format!("&character={}", encode(c));
        }
        if !self.tencent() {
            q += &format!("&realm={}", encode(&self.realm));
        }
        q
    }
}

fn accounts_file() -> Option<PathBuf> {
    let dir = dirs::config_dir()?.join("pobt");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("accounts.json"))
}

/// The accounts used before, the last used first.
pub fn accounts() -> Vec<Account> {
    accounts_file()
        .and_then(|f| std::fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn save_accounts(list: &[Account]) {
    if let Some(f) = accounts_file() {
        if let Err(e) = std::fs::write(&f, serde_json::to_vec_pretty(list).unwrap_or_default()) {
            log::warn!("saving {}: {e}", f.display());
        }
    }
}

/// `account` first among the accounts kept, in place of one of the same realm and name.
fn remember(account: &Account) {
    let mut list = accounts();
    list.retain(|a| !(a.realm == account.realm && a.name.eq_ignore_ascii_case(&account.name)));
    list.insert(0, account.clone());
    list.truncate(20);
    save_accounts(&list);
}

/// Percent-encodes `s` for a URL's query.
fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// A site's answer to a call, or why there is none: an error the launcher
/// words (`private`, `notFound`, `rateLimited`, `login`, `network`).
fn get(account: &Account, path: &str) -> Result<String, String> {
    let url = format!("{}{path}", account.host());
    let agent = if account.tencent() {
        // Tencent's site is for browsers.
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36".to_string()
    } else {
        format!("POBT/{} (+https://github.com/huacnlee/pobt)", env!("CARGO_PKG_VERSION"))
    };
    let mut req = ureq::get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .set("User-Agent", &agent)
        .set("Accept", "application/json, text/plain, */*");
    if !account.sessid.trim().is_empty() {
        req = req.set("Cookie", &format!("POESESSID={}", account.sessid.trim()));
    }
    if account.tencent() {
        req = req.set("Referer", "https://poe.game.qq.com/");
    }
    log::info!("account: GET {}{}", account.host(), path.split('?').next().unwrap_or(""));
    let body = match req.call() {
        Ok(r) => r.into_string().map_err(|e| format!("network: {e}"))?,
        Err(ureq::Error::Status(401 | 403, _)) => return Err("private".into()),
        Err(ureq::Error::Status(404, _)) => return Err("notFound".into()),
        Err(ureq::Error::Status(429, _)) => return Err("rateLimited".into()),
        Err(ureq::Error::Status(code, _)) => return Err(format!("network: HTTP {code}")),
        Err(e) => return Err(format!("network: {e}")),
    };
    // A page in place of JSON: a login page (no or an expired POESESSID), or a check for browsers.
    if body.trim_start().starts_with('<') {
        return Err("login".into());
    }
    Ok(body)
}

fn json(body: &str) -> Result<Value, String> {
    let v: Value = serde_json::from_str(body).map_err(|e| format!("network: {e}"))?;
    // The site answers `false`, or `{ "error": … }`, for what it will not show.
    if v == Value::Bool(false) {
        return Err("private".into());
    }
    if let Some(e) = v.get("error") {
        log::warn!("account: {e}");
        return Err(match e.get("code").and_then(Value::as_i64) {
            Some(1) => "notFound".into(),
            Some(3) => "rateLimited".into(),
            Some(6) => "private".into(),
            _ => format!("network: {}", e.get("message").and_then(Value::as_str).unwrap_or("error")),
        });
    }
    Ok(v)
}

/// The account's name as the site spells it: Path of Exile's names have a
/// `#1234` (or, typed, `-1234`); its item calls need the name's own case,
/// which its profile page has.
fn account_name(account: &Account) -> Result<String, String> {
    let name = account.name.trim();
    if name.is_empty() {
        if account.sessid.trim().is_empty() {
            return Err("needAccount".into());
        }
        let v = json(&get(account, "character-window/get-account-name")?)?;
        return v.get("accountName").and_then(Value::as_str).map(str::to_string).ok_or_else(|| "needAccount".into());
    }
    if account.tencent() {
        return Ok(name.to_string());
    }
    let mut name = name.replace(' ', "");
    if let Some(i) = name.rfind('-').filter(|&i| name[i + 1..].len() == 4 && name[i + 1..].bytes().all(|b| b.is_ascii_digit())) {
        name.replace_range(i..i + 1, "#");
    }
    let page = get(account, &format!("account/view-profile/{}", encode(&name)));
    if let Ok(page) = page {
        let found = page.split("/view-profile/").skip(1).find_map(|s| s.split_once("/characters").map(|(n, _)| n.to_string()));
        if let Some(found) = found.filter(|n| !n.contains(['"', '<', '>', '/'])) {
            return Ok(found.replace("%23", "#").replace("%2523", "#"));
        }
    }
    Ok(name)
}

/// The dictionary that turns Tencent's Chinese back to English, loaded once.
fn reverse() -> &'static Reverse {
    static REV: OnceLock<Reverse> = OnceLock::new();
    REV.get_or_init(|| Reverse::load("zh-rCN"))
}

const MOD_LISTS: &[&str] = &[
    "implicitMods",
    "explicitMods",
    "craftedMods",
    "enchantMods",
    "fracturedMods",
    "crucibleMods",
    "scourgeMods",
    "utilityMods",
    "veiledMods",
    "mutatedMods",
];

/// The names of the properties POB reads, as Tencent words them.
const PROPERTIES: &[(&str, &str)] = &[
    ("品质", "Quality"),
    ("范围", "Radius"),
    ("半径", "Radius"),
    ("仅限", "Limited to"),
    ("限制", "Limited to"),
    ("等级", "Level"),
    ("闪避值", "Evasion Rating"),
    ("能量护盾", "Energy Shield"),
    ("护甲", "Armour"),
    ("结界", "Ward"),
    ("职业:", "Class:"),
    ("职业", "Class:"),
];

/// A jewel's radius, as Tencent words it.
const RADII: &[(&str, &str)] = &[("小", "Small"), ("中", "Medium"), ("大", "Large"), ("非常大", "Very Large"), ("超大", "Very Large"), ("极大", "Very Large"), ("可变", "Variable")];

fn has_chinese(s: &str) -> bool {
    s.chars().any(|c| c as u32 >= 0x2e80)
}

/// Tencent's item in English, as far as the dictionary goes; `missed` counts
/// the lines of mods it does not know, which stay in Chinese.
fn translate_item(rev: &Reverse, item: &mut Value, missed: &mut usize) {
    let Some(obj) = item.as_object_mut() else { return };
    let english = |s: &str| if has_chinese(s) { rev.english(s) } else { Some(s.to_string()) };

    let base = obj.get("baseType").and_then(Value::as_str).and_then(english);
    if let Some(name) = obj.get("name").and_then(Value::as_str).filter(|s| has_chinese(s)) {
        if let Some(en) = rev.english(name) {
            obj.insert("name".into(), en.into());
        }
    }
    if let Some(type_line) = obj.get("typeLine").and_then(Value::as_str).filter(|s| has_chinese(s)) {
        // A magic item's line has its affixes' names around the base's: its base alone.
        let magic = obj.get("frameType").and_then(Value::as_i64) == Some(1);
        let en = if magic { base.clone().or_else(|| rev.english(type_line)) } else { rev.english(type_line).or_else(|| base.clone()) };
        if let Some(en) = en {
            obj.insert("typeLine".into(), en.into());
        }
    }
    if let Some(base) = base {
        obj.insert("baseType".into(), base.into());
    }
    if let Some(hybrid) = obj.get_mut("hybrid").and_then(Value::as_object_mut) {
        if let Some(en) = hybrid.get("baseTypeName").and_then(Value::as_str).filter(|s| has_chinese(s)).and_then(|s| rev.english(s)) {
            hybrid.insert("baseTypeName".into(), en.into());
        }
    }

    for list in ["properties", "requirements", "additionalProperties"] {
        for prop in obj.get_mut(list).and_then(Value::as_array_mut).into_iter().flatten() {
            let Some(p) = prop.as_object_mut() else { continue };
            let Some(name) = p.get("name").and_then(Value::as_str).filter(|s| has_chinese(s)) else { continue };
            let key: String = name.chars().filter(|c| !c.is_whitespace()).map(|c| if c == '：' { ':' } else { c }).collect();
            let en = PROPERTIES.iter().find(|(zh, _)| *zh == key).map(|(_, en)| en.to_string()).or_else(|| rev.english(name));
            let Some(en) = en else { continue };
            if en == "Radius" {
                for v in p.get_mut("values").and_then(Value::as_array_mut).into_iter().flatten() {
                    if let Some(r) = v.get(0).and_then(Value::as_str).and_then(|s| RADII.iter().find(|(zh, _)| *zh == s.trim())) {
                        v[0] = r.1.into();
                    }
                }
            }
            p.insert("name".into(), en.into());
        }
    }

    for list in MOD_LISTS {
        for m in obj.get_mut(*list).and_then(Value::as_array_mut).into_iter().flatten() {
            // A mod is its text, or `{ description, … }` (the newer API's).
            let text = match m {
                Value::String(s) => s,
                Value::Object(o) => match o.get_mut("description") {
                    Some(Value::String(s)) => s,
                    _ => continue,
                },
                _ => continue,
            };
            let lines: Vec<String> = text
                .split('\n')
                .map(|line| {
                    if !has_chinese(line) {
                        return line.to_string();
                    }
                    rev.english(line).unwrap_or_else(|| {
                        *missed += 1;
                        line.to_string()
                    })
                })
                .collect();
            *text = lines.join("\n");
        }
    }

    for socketed in obj.get_mut("socketedItems").and_then(Value::as_array_mut).into_iter().flatten() {
        translate_item(rev, socketed, missed);
    }
}

fn translate_items(list: Option<&mut Value>, missed: &mut usize) {
    let rev = reverse();
    for item in list.and_then(Value::as_array_mut).into_iter().flatten() {
        translate_item(rev, item, missed);
    }
}

/// What a job asks: an account's characters, or one of them made a build.
#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    pub account: Account,
    /// The character, as the list gave it.
    #[serde(default)]
    pub character: Option<Value>,
    /// `code`: its build code; `save`: also saved among POB's builds.
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub pob_dir: String,
}

/// The job running or last run, as the launcher polls it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Progress {
    pub kind: String,
    /// `running`, `done` or `failed`.
    pub state: String,
    /// Where a running job is: `account`, `characters`, `items`, `translating`, `loading`, `importing`, `saving`.
    pub step: String,
    pub error: String,
    pub result: Value,
}

static JOB: Mutex<Option<Progress>> = Mutex::new(None);

pub fn progress() -> Option<Progress> {
    JOB.lock().unwrap().clone()
}

fn set_step(step: &str) {
    if let Some(p) = JOB.lock().unwrap().as_mut() {
        p.step = step.to_string();
    }
}

/// A job that cannot start, failed with `error` at once; false while one runs.
pub fn fail(kind: &str, error: &str) -> bool {
    let mut job = JOB.lock().unwrap();
    if job.as_ref().is_some_and(|p| p.state == "running") {
        return false;
    }
    *job = Some(Progress { kind: kind.into(), state: "failed".into(), error: error.into(), ..Default::default() });
    true
}

/// Starts a job, `characters` or `export`, in the background; false while
/// one runs.
pub fn start(kind: &str, request: Request) -> bool {
    {
        let mut job = JOB.lock().unwrap();
        if job.as_ref().is_some_and(|p| p.state == "running") {
            return false;
        }
        *job = Some(Progress { kind: kind.to_string(), state: "running".into(), ..Default::default() });
    }
    let kind = kind.to_string();
    std::thread::spawn(move || {
        let out = match kind.as_str() {
            "characters" => characters(&request),
            _ => export(&request),
        };
        if let Err(e) = &out {
            log::warn!("account {kind}: {e}");
        }
        let mut job = JOB.lock().unwrap();
        if let Some(p) = job.as_mut() {
            match out {
                Ok(v) => {
                    p.state = "done".into();
                    p.result = v;
                }
                Err(e) => {
                    p.state = "failed".into();
                    p.error = e;
                }
            }
        }
    });
    true
}

/// The account's characters: `{ account, characters }`, the account named
/// as the site spells it.
fn characters(req: &Request) -> Result<Value, String> {
    let mut account = req.account.clone();
    if account.tencent() && account.sessid.trim().is_empty() {
        return Err("needSessid".into());
    }
    set_step("account");
    account.name = account_name(&account)?;
    set_step("characters");
    let mut list = json(&get(&account, &format!("character-window/get-characters?{}", account.query(None)))?)?;
    let Some(chars) = list.as_array_mut() else { return Err("network: not a list".into()) };
    if !account.tencent() {
        chars.retain(|c| c.get("realm").and_then(Value::as_str).is_none_or(|r| r == account.realm));
    }
    if chars.is_empty() {
        return Err("noCharacters".into());
    }
    remember(&account);
    Ok(serde_json::json!({ "account": account.name, "characters": list }))
}

/// A file name for the build of `name`: what Windows does not take, out.
fn file_name(name: &str) -> String {
    let n: String = name.chars().map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { '_' } else { c }).collect();
    let n = n.trim().trim_end_matches('.').to_string();
    if n.is_empty() { "Imported".into() } else { n }
}

/// `dir/name.xml`, or `name (2).xml`… when that is taken.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let mut path = dir.join(format!("{name}.xml"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{name} ({n}).xml"));
        n += 1;
    }
    path
}

/// The character made a build: `{ code, path, untranslated }` (`path` when
/// saved, `untranslated` the lines of mods left in Chinese).
fn export(req: &Request) -> Result<Value, String> {
    let account = &req.account;
    let character = req.character.clone().ok_or("no character")?;
    let name = character.get("name").and_then(Value::as_str).ok_or("no character")?.to_string();
    if req.pob_dir.is_empty() || !Path::new(&req.pob_dir).join("Launch.lua").is_file() {
        return Err("noPob".into());
    }
    set_step("items");
    let q = account.query(Some(&name));
    let mut items = json(&get(account, &format!("character-window/get-items?{q}"))?)?;
    let mut passives = json(&get(account, &format!("character-window/get-passive-skills?{q}"))?)?;
    let mut missed = 0;
    if account.tencent() {
        set_step("translating");
        translate_items(items.get_mut("items"), &mut missed);
        translate_items(passives.get_mut("items"), &mut missed);
    }
    // The list's entry, with what the items' call says of the character.
    let mut char = character.clone();
    if let (Some(c), Some(from)) = (char.as_object_mut(), items.get("character").and_then(Value::as_object)) {
        for key in ["classId", "ascendancyClass", "level", "league"] {
            if let (false, Some(v)) = (c.contains_key(key), from.get(key)) {
                c.insert(key.into(), v.clone());
            }
        }
    }
    let out = crate::host::export(
        PathBuf::from(&req.pob_dir),
        name.clone(),
        char.to_string(),
        items.to_string(),
        passives.to_string(),
        set_step,
    )?;
    let mut path = String::new();
    if req.action == "save" {
        set_step("saving");
        let dir = if out.build_path.is_empty() { Path::new(&req.pob_dir).join("Builds") } else { PathBuf::from(&out.build_path) };
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let file = free_path(&dir, &file_name(&name));
        std::fs::write(&file, &out.xml).map_err(|e| format!("{}: {e}", file.display()))?;
        path = file.display().to_string();
    }
    Ok(serde_json::json!({ "code": out.code, "path": path, "untranslated": missed }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_names() {
        assert_eq!(encode("Name#1234"), "Name%231234");
        assert_eq!(encode("流放者"), "%E6%B5%81%E6%94%BE%E8%80%85");
    }

    #[test]
    fn queries() {
        let pc = Account { realm: "pc".into(), name: "A#1".into(), sessid: String::new() };
        assert_eq!(pc.query(Some("B C")), "accountName=A%231&character=B%20C&realm=pc");
        let qq = Account { realm: "tencent".into(), name: "甲".into(), sessid: "x".into() };
        assert_eq!(qq.query(None), "accountName=%E7%94%B2");
    }

    #[test]
    fn file_names() {
        assert_eq!(file_name("a/b:c"), "a_b_c");
        assert_eq!(file_name("  "), "Imported");
    }

    /// A Tencent item, as its site gives it, back in English.
    #[test]
    fn translates_tencent_items() {
        let rev = reverse();
        let mut item = serde_json::json!({
            "name": "", "typeLine": "瓦尔法衣", "baseType": "瓦尔法衣", "frameType": 2, "ilvl": 84,
            "properties": [{ "name": "品质", "values": [["+20%", 1]] }],
            "requirements": [{ "name": "等级", "values": [["68", 0]] }],
            "explicitMods": ["+80 最大生命", "这行没有"],
            "socketedItems": [{ "typeLine": "附加火焰伤害（辅）", "properties": [{ "name": "等级", "values": [["20", 0]] }] }],
        });
        let mut missed = 0;
        translate_item(rev, &mut item, &mut missed);
        assert_eq!(item["typeLine"], "Vaal Regalia");
        assert_eq!(item["properties"][0]["name"], "Quality");
        assert_eq!(item["requirements"][0]["name"], "Level");
        assert_eq!(item["explicitMods"][0], "+80 to maximum Life");
        assert_eq!(item["socketedItems"][0]["typeLine"], "Added Fire Damage");
        assert_eq!(missed, 1);
    }

    /// A Tencent character, its items in Chinese, made a build by the POB of
    /// `POB_DIR`, whose code holds them in English. Ignored by default: it
    /// runs the whole of POB, and changes the process's folder.
    #[test]
    #[ignore = "runs the whole of POB"]
    fn exports_a_tencent_character() {
        let Some(dir) = std::env::var_os("POB_DIR").map(PathBuf::from) else {
            eprintln!("POB_DIR not set: skipped");
            return;
        };
        let char = serde_json::json!({ "name": "测试角色", "league": "永久", "classId": 5, "ascendancyClass": 1, "class": "判官", "level": 90 });
        let mut items = serde_json::json!({ "items": [{
            "id": "a1", "inventoryId": "BodyArmour", "frameType": 2, "ilvl": 84, "name": "厄运 外衣",
            "typeLine": "瓦尔法衣", "baseType": "瓦尔法衣",
            "properties": [{ "name": "品质", "values": [["+20%", 1]] }],
            "explicitMods": ["+80 最大生命"],
            "sockets": [{ "group": 0, "sColour": "B" }, { "group": 0, "sColour": "R" }],
            "socketedItems": [
                { "typeLine": "火球", "socket": 0, "properties": [{ "name": "等级", "values": [["20", 0]] }] },
                { "typeLine": "附加火焰伤害（辅）", "support": true, "socket": 1, "properties": [{ "name": "等级", "values": [["20", 0]] }] }
            ],
        }]});
        let passives = serde_json::json!({ "hashes": [], "items": [], "mastery_effects": {}, "jewel_data": {} });
        let mut missed = 0;
        translate_items(items.get_mut("items"), &mut missed);
        assert_eq!(missed, 0);
        let out = crate::host::export(dir, "测试角色".into(), char.to_string(), items.to_string(), passives.to_string(), |s| eprintln!("step: {s}"))
            .unwrap();
        assert!(out.code.len() > 100, "{}", out.code);
        assert!(out.xml.contains("Vaal Regalia"), "{}", out.xml);
        assert!(out.xml.contains("+80 to maximum Life"), "{}", out.xml);
        assert!(out.xml.contains("Fireball") && out.xml.contains("Added Fire Damage"), "{}", out.xml);
        assert!(out.xml.contains("Inquisitor"), "{}", out.xml);
        eprintln!("build path: {}", out.build_path);
    }
}
