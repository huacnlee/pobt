//! Characters from an account on Path of Exile's site, or Tencent's, made
//! builds: their list, their items and passive tree from the site's
//! `character-window` API, imported by POB's own Import tab on a POB with no
//! window (`host::export`), and given back as a build code or saved among
//! POB's builds. Tencent's site needs the account's `POESESSID` cookie, and
//! gives items in Chinese, which go back to English by `reverse`. The
//! accounts used are kept in `%APPDATA%\pobt\accounts.json`. Path of Exile
//! 2's characters come from its API instead, signed in to by OAuth (`oauth`),
//! and are imported by Path of Building 2's Import tab.

use std::{
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::reverse::Reverse;

/// An account: its realm (`pc`, `xbox`, `sony`, `tencent`, or `poe2` for Path
/// of Exile 2's), name, and `POESESSID`, which a private profile and Tencent
/// need, or Path of Exile 2's OAuth token, its refresh token and when it
/// expires (seconds since 1970); and its characters
/// as the site listed them last, and when (seconds since 1970), kept so as
/// not to ask the site again.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Account {
    pub realm: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub sessid: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub characters: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated: Option<u64>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub token: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub refresh: String,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub expires: u64,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

impl Account {
    /// Who the account is, for what is kept of it: its realm and name, or its POESESSID without a name.
    fn key(&self) -> String {
        let who = if self.name.is_empty() { &self.sessid } else { &self.name };
        format!("{}|{}", self.realm, who.to_lowercase())
    }

    fn tencent(&self) -> bool {
        self.realm == "tencent"
    }

    fn poe2(&self) -> bool {
        self.realm == "poe2"
    }

    /// A Path of Exile 2 character of Tencent's, shared from WeGame: its share link in place of a POESESSID.
    fn wegame(&self) -> bool {
        self.realm == "wegame"
    }

    fn host(&self) -> &'static str {
        if self.tencent() { "https://poe.game.qq.com/" } else { "https://www.pathofexile.com/" }
    }

    /// The query of a `character-window` call for this account. Tencent's
    /// site knows the account by its `POESESSID`: the name may be left out.
    fn query(&self, character: Option<&str>) -> String {
        let mut q = Vec::new();
        if !self.name.is_empty() {
            q.push(format!("accountName={}", encode(&self.name)));
        }
        if let Some(c) = character {
            q.push(format!("character={}", encode(c)));
        }
        if !self.tencent() {
            q.push(format!("realm={}", encode(&self.realm)));
        }
        q.join("&")
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
    list.retain(|a| a.key() != account.key());
    list.insert(0, account.clone());
    list.truncate(20);
    save_accounts(&list);
}

/// The account's token as last kept: the launcher's copy may be older, renewed since.
fn kept_token(account: &mut Account) {
    if let Some(kept) = accounts().into_iter().find(|a| a.key() == account.key() && !a.token.is_empty()) {
        (account.token, account.refresh, account.expires) = (kept.token, kept.refresh, kept.expires);
    }
}

/// The account's new token kept, where it is among the accounts.
fn keep_token(account: &Account) {
    let mut list = accounts();
    if let Some(kept) = list.iter_mut().find(|a| a.key() == account.key()) {
        kept.token = account.token.clone();
        kept.refresh = account.refresh.clone();
        kept.expires = account.expires;
        save_accounts(&list);
    }
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
/// words (`private`, `notFound`, `rateLimited:<seconds to wait, when the
/// site says>`, `login`, `network`).
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
        // Too many calls: the site says for how long it refuses more (`Retry-After`), most often.
        Err(ureq::Error::Status(429, r)) => return Err(format!("rateLimited:{}", r.header("Retry-After").unwrap_or_default())),
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
            Some(3) => "rateLimited:".into(),
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
    if account.tencent() {
        // Its site has no `get-account-name`, and needs no name with the POESESSID.
        return Ok(name.to_string());
    }
    if name.is_empty() {
        if account.sessid.trim().is_empty() {
            return Err("needAccount".into());
        }
        let v = json(&get(account, "character-window/get-account-name")?)?;
        return v.get("accountName").and_then(Value::as_str).map(str::to_string).ok_or_else(|| "needAccount".into());
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

/// Where an item is that POB imports: worn, a flask, a jewel in the tree.
const WORN: &[&str] = &[
    "Weapon", "Offhand", "Weapon2", "Offhand2", "Helm", "BodyArmour", "Gloves", "Boots", "Amulet", "Ring", "Ring2", "Ring3", "Belt", "Flask",
    "PassiveJewels", "BrequelGrafts", "BrequelGrafts2", "VisceraHead", "VisceraBody", "VisceraArm", "VisceraLeg",
];

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
const RADII: &[(&str, &str)] = &[("小", "Small"), ("中", "Medium"), ("大", "Large"), ("非常大", "Very Large"), ("超大", "Very Large"), ("极大", "Very Large"), ("可变", "Variable"), ("变量", "Variable")];

fn has_chinese(s: &str) -> bool {
    s.chars().any(|c| c as u32 >= 0x2e80)
}

/// Tencent's item in English, as far as the dictionary goes; `missed` counts
/// the lines of mods it does not know, which stay in Chinese.
fn translate_item(rev: &Reverse, item: &mut Value, missed: &mut usize) {
    let Some(obj) = item.as_object_mut() else { return };
    // A gem: POB reads its name only, which may be a support's.
    if obj.get("frameType").and_then(Value::as_i64) == Some(4) {
        for key in ["typeLine", "baseType"] {
            if let Some(en) = obj.get(key).and_then(Value::as_str).filter(|s| has_chinese(s)).and_then(|s| rev.gem(s)) {
                obj.insert(key.into(), en.into());
            }
        }
        if let Some(hybrid) = obj.get_mut("hybrid").and_then(Value::as_object_mut) {
            if let Some(en) = hybrid.get("baseTypeName").and_then(Value::as_str).filter(|s| has_chinese(s)).and_then(|s| rev.gem(s)) {
                hybrid.insert("baseTypeName".into(), en.into());
            }
        }
        translate_properties(rev, obj);
        return;
    }
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

    translate_properties(rev, obj);

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
            // A mod of several lines whole, as Path of Building combines a line with the next: Tencent breaks some
            // elsewhere than the English does; else line by line.
            if text.contains('\n') && has_chinese(text) {
                if let Some(en) = rev.english(text) {
                    *text = en;
                    continue;
                }
            }
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

/// The names of an item's properties and requirements POB reads, in English;
/// a jewel's radius too.
fn translate_properties(rev: &Reverse, obj: &mut serde_json::Map<String, Value>) {
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
}

/// The tattoos of a Tencent passive tree, their names and stats in English:
/// POB finds a tattoo by its name.
fn translate_overrides(passives: &mut Value, missed: &mut usize) {
    let rev = reverse();
    let Some(overrides) = passives.get_mut("skill_overrides").and_then(Value::as_object_mut) else { return };
    for o in overrides.values_mut() {
        if let Some(en) = o.get("name").and_then(Value::as_str).filter(|s| has_chinese(s)).and_then(|s| rev.english(s)) {
            o["name"] = en.into();
        }
        for stat in o.get_mut("stats").and_then(Value::as_array_mut).into_iter().flatten() {
            if let Some(s) = stat.as_str().filter(|s| has_chinese(s)) {
                match rev.english(s) {
                    Some(en) => *stat = en.into(),
                    None => *missed += 1,
                }
            }
        }
    }
}

fn translate_items(list: Option<&mut Value>, missed: &mut usize) {
    let rev = reverse();
    for item in list.and_then(Value::as_array_mut).into_iter().flatten() {
        translate_item(rev, item, missed);
    }
}

/// The items and passive trees of characters asked for since the account's
/// list was last got, by the account's key and the character: copying a
/// character's code, then saving it, asks the site once (Tencent allows few
/// calls).
static ITEMS: Mutex<std::collections::BTreeMap<(String, String), (Value, Value)>> = Mutex::new(std::collections::BTreeMap::new());

/// What a job asks: an account's characters, or one of them made a build.
#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    pub account: Account,
    /// The character, as the list gave it.
    #[serde(default)]
    pub character: Option<Value>,
    #[serde(default)]
    pub pob_dir: String,
}

/// The job running or last run, as the launcher polls it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Progress {
    pub kind: String,
    /// `running`, `done` or `failed`.
    pub state: String,
    /// Where a running job is: `account`, `characters`, `items`, `translating`, `loading`, `importing`.
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
    if account.poe2() {
        return poe2_characters(account);
    }
    if account.wegame() {
        return wegame_characters(account);
    }
    if account.tencent() {
        // Its site knows the account by the POESESSID alone.
        account.name.clear();
        if account.sessid.trim().is_empty() {
            return Err("needSessid".into());
        }
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
    // Their items are the site's again, from now.
    ITEMS.lock().unwrap().retain(|(who, _), _| *who != account.key());
    account.characters = Some(list);
    account.updated = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs());
    remember(&account);
    Ok(serde_json::to_value(&account).unwrap_or_default())
}

/// Path of Exile 2's characters, from its API, signed in to first when need be.
fn poe2_characters(mut account: Account) -> Result<Value, String> {
    set_step("characters");
    kept_token(&mut account);
    let before = account.key();
    let mut list = crate::oauth::api(&mut account, "/character/poe2", &|| set_step("signin"))?;
    let list = list.get_mut("characters").map(Value::take).unwrap_or_default();
    if list.as_array().is_none_or(Vec::is_empty) {
        return Err("noCharacters".into());
    }
    // Signed in, the account has its name: as it was kept without, it goes.
    if before != account.key() {
        save_accounts(&accounts().into_iter().filter(|a| a.key() != before).collect::<Vec<_>>());
    }
    ITEMS.lock().unwrap().retain(|(who, _), _| *who != account.key());
    account.characters = Some(list);
    account.updated = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs());
    remember(&account);
    Ok(serde_json::to_value(&account).unwrap_or_default())
}

/// The character a WeGame share link shares, the account's only one, named after it.
fn wegame_characters(mut account: Account) -> Result<Value, String> {
    set_step("characters");
    let code = crate::wegame::share_code(&account.sessid).ok_or("needShare")?;
    let role = crate::wegame::role(&code)?;
    account.sessid = code;
    account.name = role["name"].as_str().unwrap_or_default().to_string();
    account.characters = Some(Value::Array(vec![crate::wegame::listed(&role)]));
    account.updated = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs());
    remember(&account);
    Ok(serde_json::to_value(&account).unwrap_or_default())
}

/// The last build made, to save: where POB would keep it, and its XML.
pub struct Build {
    pub file: PathBuf,
    pub xml: String,
}

pub static BUILD: Mutex<Option<Build>> = Mutex::new(None);

/// A folder or a build in POB's builds folder, for the launcher's tree: its
/// path from that folder, with `/`.
#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub dir: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Entry>,
}

/// The folders and builds (`.xml`) under `dir`, folders first, each by name;
/// so deep, and so many, at most.
pub(crate) fn entries(dir: &Path, rel: &str, depth: u32, budget: &mut u32) -> Vec<Entry> {
    let Ok(read) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut list: Vec<(bool, String)> = read
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let is_dir = e.file_type().ok()?.is_dir();
            (is_dir || name.to_lowercase().ends_with(".xml")).then_some((is_dir, name))
        })
        .filter(|(_, name)| !name.starts_with('.'))
        .collect();
    list.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase())));
    let mut out = Vec::new();
    for (is_dir, name) in list {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        let children = if is_dir && depth > 0 { entries(&dir.join(&name), &path, depth - 1, budget) } else { Vec::new() };
        out.push(Entry { name, path, dir: is_dir, children });
    }
    out
}

/// POB's builds folder, where the last build made would go, and what is in it.
pub fn builds() -> Option<(PathBuf, Vec<Entry>)> {
    let root = BUILD.lock().unwrap().as_ref()?.file.parent()?.to_path_buf();
    let _ = std::fs::create_dir_all(&root);
    let tree = entries(&root, "", 6, &mut 2000);
    Some((root, tree))
}

/// Saves the last build made at `path` in POB's builds folder (a build there,
/// replaced, or a new one: `.xml` added when it has none); where it went.
pub fn save_build(path: &str) -> Result<PathBuf, String> {
    let build = BUILD.lock().unwrap();
    let build = build.as_ref().ok_or("no build")?;
    let root = build.file.parent().ok_or("no builds folder")?;
    let rel = Path::new(path.trim());
    // Nowhere but in the builds folder.
    let inside = rel.components().all(|c| matches!(c, std::path::Component::Normal(_)));
    if !inside || rel.as_os_str().is_empty() {
        return Err(format!("{path}: not in {}", root.display()));
    }
    let mut file = root.join(rel);
    if !file.extension().is_some_and(|e| e.eq_ignore_ascii_case("xml")) {
        let mut name = file.file_name().unwrap_or_default().to_os_string();
        name.push(".xml");
        file.set_file_name(name);
    }
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    std::fs::write(&file, &build.xml).map_err(|e| format!("{}: {e}", file.display()))?;
    Ok(file)
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

/// The character made a build: `{ code, untranslated }` (`untranslated`: the
/// lines of mods left in Chinese); the build kept for `BUILD`.
fn export(req: &Request) -> Result<Value, String> {
    let account = &req.account;
    let character = req.character.clone().ok_or("no character")?;
    let name = character.get("name").and_then(Value::as_str).ok_or("no character")?.to_string();
    if req.pob_dir.is_empty() || !Path::new(&req.pob_dir).join("Launch.lua").is_file() {
        return Err("noPob".into());
    }
    set_step("items");
    let key = (account.key(), name.clone());
    let kept = ITEMS.lock().unwrap().get(&key).cloned();
    if account.poe2() {
        return export_poe2(req, &name, key, kept.map(|(c, _)| c));
    }
    if account.wegame() {
        return export_wegame(req, &name);
    }
    let (mut items, mut passives) = match kept {
        Some(kept) => kept,
        None => {
            let q = account.query(Some(&name));
            let items = json(&get(account, &format!("character-window/get-items?{q}"))?)?;
            let passives = json(&get(account, &format!("character-window/get-passive-skills?{q}"))?)?;
            ITEMS.lock().unwrap().insert(key, (items.clone(), passives.clone()));
            (items, passives)
        }
    };
    // What POB imports: the rest (the inventory) is not translated, nor counted.
    if let Some(list) = items.get_mut("items").and_then(Value::as_array_mut) {
        list.retain(|i| i["inventoryId"].as_str().is_some_and(|id| WORN.contains(&id)));
    }
    let mut missed = 0;
    if account.tencent() {
        set_step("translating");
        translate_items(items.get_mut("items"), &mut missed);
        translate_items(passives.get_mut("items"), &mut missed);
        translate_overrides(&mut passives, &mut missed);
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
    Ok(serde_json::json!({ "code": keep_build(req, &name, out), "untranslated": missed }))
}

/// The build made kept for `save_build`, which asks where: in POB's builds
/// folder, to begin with; its code.
fn keep_build(req: &Request, name: &str, out: crate::host::Exported) -> String {
    let dir = if out.build_path.is_empty() { Path::new(&req.pob_dir).join("Builds") } else { PathBuf::from(&out.build_path) };
    *BUILD.lock().unwrap() = Some(Build { file: free_path(&dir, &file_name(name)), xml: out.xml });
    out.code
}

/// A Path of Exile 2 character made a build: the whole of it (items, skills,
/// passives) from one call, imported by Path of Building 2's Import tab.
fn export_poe2(req: &Request, name: &str, key: (String, String), kept: Option<Value>) -> Result<Value, String> {
    let char = match kept {
        Some(c) => c,
        None => {
            let mut account = req.account.clone();
            kept_token(&mut account);
            let token = account.token.clone();
            let mut v = crate::oauth::api(&mut account, &format!("/character/poe2/{}", encode(name)), &|| set_step("signin"))?;
            if account.token != token {
                keep_token(&account);
            }
            let c = v.get_mut("character").map(Value::take).filter(Value::is_object).ok_or("notFound")?;
            ITEMS.lock().unwrap().insert(key, (c.clone(), Value::Null));
            c
        }
    };
    // The character alone: Path of Building 2 reads its items and passives from it.
    let out = crate::host::export(PathBuf::from(&req.pob_dir), name.to_string(), char.to_string(), String::new(), String::new(), set_step)?;
    Ok(serde_json::json!({ "code": keep_build(req, name, out), "untranslated": 0 }))
}

/// A WeGame character made a build: its items and passives in English (`wegame`), imported by Path of Building 2's
/// Import tab as the API's are.
fn export_wegame(req: &Request, name: &str) -> Result<Value, String> {
    let code = crate::wegame::share_code(&req.account.sessid).ok_or("needShare")?;
    set_step("translating");
    let (char, missed) = crate::wegame::character(&code)?;
    let out = crate::host::export(PathBuf::from(&req.pob_dir), name.to_string(), char.to_string(), String::new(), String::new(), set_step)?;
    Ok(serde_json::json!({ "code": keep_build(req, name, out), "untranslated": missed }))
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
        let pc = Account { realm: "pc".into(), name: "A#1".into(), sessid: String::new(), ..Default::default() };
        assert_eq!(pc.query(Some("B C")), "accountName=A%231&character=B%20C&realm=pc");
        let qq = Account { realm: "tencent".into(), name: "甲".into(), sessid: "x".into(), ..Default::default() };
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
        assert_eq!(item["socketedItems"][0]["typeLine"], "Added Fire Damage Support");
        assert_eq!(missed, 1);
    }

    /// A build saved in a folder of POB's builds, new or over one there, and
    /// nowhere outside them.
    #[test]
    fn saves_builds_in_the_builds_folder() {
        let root = std::env::temp_dir().join(format!("pobt-builds-{}", std::process::id()));
        std::fs::create_dir_all(root.join("Leagues")).unwrap();
        std::fs::write(root.join("Old.xml"), "old").unwrap();
        *BUILD.lock().unwrap() = Some(Build { file: root.join("New.xml"), xml: "<PathOfBuilding/>".into() });

        let (_, tree) = builds().unwrap();
        assert_eq!(tree.iter().map(|e| (e.path.as_str(), e.dir)).collect::<Vec<_>>(), [("Leagues", true), ("Old.xml", false)]);
        assert_eq!(save_build("Leagues/Mine").unwrap(), root.join("Leagues").join("Mine.xml"));
        assert_eq!(save_build("Old.xml").unwrap(), root.join("Old.xml"));
        assert_eq!(std::fs::read_to_string(root.join("Old.xml")).unwrap(), "<PathOfBuilding/>");
        assert!(save_build("../Out").is_err());
        assert!(save_build("").is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn tencent_query_without_a_name() {
        let qq = Account { realm: "tencent".into(), name: String::new(), sessid: "x".into(), ..Default::default() };
        assert_eq!(qq.query(Some("甲")), "character=%E7%94%B2");
    }

    /// The first character of a real Tencent account, by its POESESSID in
    /// `POBT_TEST_TENCENT_SESSID` (kept in `.env`, out of git): the lines of
    /// its items left in Chinese, and it made a build by the POB of
    /// `POB_DIR`. Ignored by default: it goes to Tencent's site.
    #[test]
    #[ignore = "uses a real Tencent account"]
    fn live_tencent_account() {
        let Some(sessid) = std::env::var("POBT_TEST_TENCENT_SESSID").ok().filter(|s| !s.is_empty()) else {
            eprintln!("POBT_TEST_TENCENT_SESSID not set: skipped");
            return;
        };
        let account = Account { realm: "tencent".into(), name: String::new(), sessid, ..Default::default() };
        let list = json(&get(&account, &format!("character-window/get-characters?{}", account.query(None))).unwrap()).unwrap();
        // One: Tencent allows an account 10 calls a minute.
        let chars: Vec<Value> = list.as_array().unwrap().iter().take(1).cloned().collect();
        let mut left: std::collections::BTreeMap<String, u32> = Default::default();
        for c in &chars {
            let name = c["name"].as_str().unwrap();
            let q = account.query(Some(name));
            let mut items = json(&get(&account, &format!("character-window/get-items?{q}")).unwrap()).unwrap();
            let mut missed = 0;
            translate_items(items.get_mut("items"), &mut missed);
            eprintln!("{name} ({}): {missed} lines left", c["class"]);
            fn walk(v: &Value, left: &mut std::collections::BTreeMap<String, u32>) {
                for item in v.as_array().into_iter().flatten() {
                    if item["inventoryId"].as_str().is_some_and(|i| !WORN.contains(&i)) {
                        continue;
                    }
                    if item["frameType"] == 4 {
                        if let Some(s) = item["typeLine"].as_str().filter(|s| has_chinese(s)) {
                            *left.entry(format!("[gem] {s}")).or_default() += 1;
                        }
                        continue;
                    }
                    for list in MOD_LISTS {
                        for m in item[*list].as_array().into_iter().flatten() {
                            let text = m.as_str().or(m["description"].as_str()).unwrap_or("");
                            for line in text.split('\n').filter(|l| has_chinese(l)) {
                                *left.entry(line.to_string()).or_default() += 1;
                            }
                        }
                    }
                    for key in ["typeLine", "baseType"] {
                        if let Some(s) = item[key].as_str().filter(|s| has_chinese(s)) {
                            *left.entry(format!("[{key}] {s}")).or_default() += 1;
                        }
                    }
                    walk(&item["socketedItems"], left);
                }
            }
            walk(&items["items"], &mut left);
        }
        for (line, n) in &left {
            eprintln!("left {n}× {line}");
        }
        let Some(dir) = std::env::var_os("POB_DIR").map(PathBuf::from) else { return };
        for c in &chars {
            let req = Request { account: account.clone(), character: Some(c.clone()), pob_dir: dir.display().to_string() };
            let out = export(&req).unwrap();
            eprintln!("{}: code of {} bytes, {} lines untranslated", c["name"], out["code"].as_str().unwrap().len(), out["untranslated"]);
        }
    }

    /// What Tencent's site gives of a Path of Exile 2 account, by its
    /// POESESSID in `POBT_TEST_TENCENT_SESSID`: its characters, and the shape
    /// of the first one's items and passives. Ignored: it goes to Tencent's site.
    #[test]
    #[ignore = "uses a real Tencent account"]
    fn live_tencent_poe2() {
        let Some(sessid) = std::env::var("POBT_TEST_TENCENT_SESSID").ok().filter(|s| !s.is_empty()) else {
            eprintln!("POBT_TEST_TENCENT_SESSID not set: skipped");
            return;
        };
        let account = Account { realm: "tencent".into(), sessid, ..Default::default() };
        let short = |s: &str| s.chars().take(400).collect::<String>();
        if let Ok(list) = get(&account, "character-window/get-characters?realm=poe2").and_then(|b| json(&b)) {
            let realms: std::collections::BTreeSet<_> = list.as_array().into_iter().flatten().map(|c| c["realm"].to_string()).collect();
            eprintln!("get-characters?realm=poe2: realms {realms:?}");
        }
        let n = "%E9%98%BF%E5%B8%83%E5%92%8B%E5%8A%9E%237081";
        for path in [format!("character-window/get-characters?accountName={n}&realm=poe2"), format!("account/view-profile/{n}/characters?realm=poe2"), "api/character/poe2".into(), "api/league?realm=poe2".into(), "api/account/characters?realm=poe2".into(), "poe2".into()] {
            let path = path.as_str();
            match get(&account, path) {
                Ok(b) => eprintln!("{path}: {}", short(&b)),
                Err(e) => eprintln!("{path}: {e}"),
            }
        }
    }

    /// A real Path of Exile 2 account: signed in to in the browser (sign in
    /// and allow POBT there), its characters listed, the first made a build
    /// by the Path of Building 2 of `POB2_DIR`. Ignored by default: it needs
    /// someone at the browser. Keeps the account in `accounts.json`.
    #[test]
    #[ignore = "signs in to a real Path of Exile 2 account"]
    fn live_poe2_account() {
        let req = Request { account: Account { realm: "poe2".into(), ..Default::default() }, character: None, pob_dir: String::new() };
        let got = characters(&req).unwrap();
        let account: Account = serde_json::from_value(got).unwrap();
        let list = account.characters.clone().unwrap();
        eprintln!("{}: {} characters", account.name, list.as_array().unwrap().len());
        let Some(dir) = std::env::var_os("POB2_DIR") else { return };
        let first = list[0].clone();
        let req = Request { account, character: Some(first.clone()), pob_dir: dir.to_string_lossy().into_owned() };
        let out = export(&req).unwrap();
        eprintln!("{} ({}): code of {} bytes", first["name"], first["class"], out["code"].as_str().unwrap().len());
    }

    /// A Path of Exile 2 character, as its API gives it, made a build by the
    /// Path of Building 2 of `POB2_DIR`. Ignored by default: it runs the
    /// whole of POB, and changes the process's folder.
    #[test]
    #[ignore = "runs the whole of POB 2"]
    fn exports_a_poe2_character() {
        let Some(dir) = std::env::var_os("POB2_DIR").map(PathBuf::from) else {
            eprintln!("POB2_DIR not set: skipped");
            return;
        };
        let char = serde_json::json!({
            "name": "TestWitch", "realm": "poe2", "class": "Witch", "league": "Standard", "level": 80,
            "equipment": [{
                "id": "b1", "inventoryId": "BodyArmour", "frameType": 2, "ilvl": 80, "name": "Doom Wrap",
                "typeLine": "Silk Robe", "baseType": "Silk Robe", "identified": true,
                "properties": [{ "name": "Energy Shield", "values": [["50", 1]], "displayMode": 0 }],
                "explicitMods": ["+80 to maximum Life"],
            }],
            "skills": [{ "typeLine": "Fireball", "baseType": "Fireball", "frameType": 4, "properties": [{ "name": "Level", "values": [["20", 0]] }], "socketedItems": [] }],
            "jewels": [],
            "passives": { "hashes": [], "specialisations": {}, "skill_overrides": {}, "jewel_data": {}, "quest_stats": [] },
        });
        let out = crate::host::export(dir, "TestWitch".into(), char.to_string(), String::new(), String::new(), |s| eprintln!("step: {s}")).unwrap();
        assert!(out.code.len() > 100, "{}", out.code);
        assert!(out.xml.contains("Silk Robe"), "{}", out.xml);
        assert!(out.xml.contains("+80 to maximum Life"), "{}", out.xml);
        assert!(out.xml.contains("Witch") && out.xml.contains("Fireball"), "{}", out.xml);
        eprintln!("build path: {}", out.build_path);
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
        }, {
            // a rare's name, which no dictionary has: kept in Chinese, not as "??????"
            "id": "a2", "inventoryId": "Ring", "frameType": 2, "ilvl": 84, "name": "劲风 束灵",
            "typeLine": "双玉戒指", "baseType": "双玉戒指", "explicitMods": ["+80 最大生命"],
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
        assert!(out.xml.contains("劲风 束灵") && out.xml.contains("Two-Stone Ring"), "{}", out.xml);
        eprintln!("build path: {}", out.build_path);
    }
}
