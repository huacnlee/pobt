//! The translation check: the text of the open build that POBT's dictionary has no translation for, translated by an
//! AI already on the user's machine (Claude Code or Codex, as `ai` runs them), which reads the dictionary's own files
//! to word it as they do. Each row it gives is checked (its holes, and that it translates a line it was asked for)
//! and kept in `trs/<language>/POBT-ai.csv`, which the screens read at once (`translate::watch`). With GitHub's `gh`
//! signed in, the rows can be offered to POBT itself as a pull request.

use std::{
    collections::HashSet,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    ai::{self, Job, Progress},
    translate::Dictionary,
};

/// POBT's own repository, where the rows are offered.
const UPSTREAM: &str = "huacnlee/pobt";
/// The file of the rows, in `trs/<language>/`: read after the others' rows only for what they have not.
const FILE: &str = "POBT-ai.csv";

/// What to translate: `lines` (POB's English, no colours) of the build `build`, into `language` (a `trs` folder), by
/// `agent` ("claude" or "codex").
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Request {
    pub agent: String,
    pub language: String,
    pub build: String,
    pub lines: Vec<String>,
}

/// A row the agent gave: `en` (a line, or its template with `{0}`… for its numbers), `zh` its translation; `lines`
/// what it translates of those asked for; `why` it was not kept, if it was not ("holes", "noLine", "known").
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Row {
    pub en: String,
    pub zh: String,
    pub lines: Vec<String>,
    pub why: String,
}

static JOB: Job = Job::new();

pub fn progress() -> Option<Progress> {
    JOB.progress()
}

pub fn cancel() {
    JOB.cancel();
}

/// Starts translating in the background; false while a translation runs. Its report: `{rows: [Row], file, kept}`.
pub fn start(req: Request) -> bool {
    let first = Progress { agent: req.agent.clone(), build: req.build.clone(), language: req.language.clone(), step: "starting".into(), ..Default::default() };
    JOB.start(first, move || fill(&req), |_| {})
}

fn fill(req: &Request) -> Result<(Value, String), String> {
    if req.lines.is_empty() {
        return Err("nothingMissing".into());
    }
    let folder = crate::trs::root().map(|r| r.join(&req.language)).filter(|d| d.is_dir()).ok_or("noDictionary")?;
    let text = ai::run_agent(&JOB, &req.agent, &prompt(req), Some(&folder))?;
    JOB.update(|p| p.step = "parsing".into());
    let file = folder.join(FILE);
    let known = rows_of(&std::fs::read(&file).unwrap_or_default()).into_iter().map(|(en, _)| en).collect::<HashSet<_>>();
    let rows = check(answer(&text).ok_or_else(|| format!("agentFailed: {}", text.trim().lines().last().unwrap_or("")))?, &req.lines, &known);
    let kept: Vec<(String, String)> = rows.iter().filter(|r| r.why.is_empty()).map(|r| (r.en.clone(), r.zh.clone())).collect();
    if !kept.is_empty() {
        append(&file, &kept).map_err(|e| format!("notSaved: {e}"))?;
    }
    Ok((json!({ "rows": rows, "file": file.display().to_string(), "kept": kept.len() }), text))
}

/// The language's name as the agent is told it.
fn language_name(language: &str) -> &str {
    match language {
        "zh-rCN" => "Simplified Chinese (the words of Tencent's client of Path of Exile)",
        "zh-rTW" => "Traditional Chinese (the words of Garena's client of Path of Exile)",
        "ko-KR" => "Korean (the words of Kakao's client of Path of Exile)",
        other => other,
    }
}

pub fn prompt(req: &Request) -> String {
    let lang = language_name(&req.language);
    let lines: String = req.lines.iter().map(|l| format!("{l}\n")).collect();
    format!(
        "You translate Path of Exile text for POBT (Path of Building with its screens translated) into {lang}.\n\
         \n\
         The folder you are in is POBT's dictionary in that language: CSV files of \"English\",\"translation\" rows; \
         tencent/game.csv has the game's own words for its mods, bases, uniques, gems and passives. Before you \
         translate a line, search those files (Grep) for its words and names, and translate as they do: the same \
         names for skills, items, passives, keywords and stats, the same wording for the same kind of mod, their \
         punctuation and spacing. You only read; change nothing.\n\
         \n\
         Answer with one JSON object and nothing else: {{\"rows\": [{{\"en\": \"...\", \"zh\": \"...\"}}]}}\n\
         - en: the line as it is, or, when it has numbers that change from item to item (a mod's values), the line \
         with each such number as {{0}}, {{1}}… in order (\"Gain {{0}} Life per Enemy Killed\"); zh then has the same \
         holes.\n\
         - zh: the translation, whatever the language (the key is only named zh).\n\
         - Leave out a line you are not sure of. Never make up the name of a unique, a base, a skill or a passive \
         that the files do not have: leave that line out.\n\
         \n\
         The lines, one per line, from the build \"{build}\":\n{lines}",
        build = req.build,
    )
}

/// The rows in the agent's answer: its JSON object, from its first `{` to its last `}`.
pub fn answer(text: &str) -> Option<Vec<(String, String)>> {
    let json: Value = serde_json::from_str(text.get(text.find('{')?..=text.rfind('}')?)?).ok()?;
    let rows = json.get("rows")?.as_array()?;
    Some(
        rows.iter()
            .filter_map(|r| Some((r.get("en")?.as_str()?.trim().to_string(), r.get("zh")?.as_str()?.trim().to_string())))
            .filter(|(en, zh)| !en.is_empty() && !zh.is_empty())
            .collect(),
    )
}

/// The holes of a row's text, `{0}`, `{1}`…, sorted.
fn holes(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = s;
    while let Some(i) = rest.find('{') {
        let after = &rest[i + 1..];
        match after.find('}') {
            Some(j) if j > 0 && after[..j].bytes().all(|b| b.is_ascii_digit()) => {
                out.push(after[..j].to_string());
                rest = &after[j + 1..];
            }
            _ => rest = after,
        }
    }
    out.sort();
    out
}

/// Each row with the lines of `lines` it translates, and why it is not kept, if it is not: its holes differ from its
/// translation's ("holes"), it translates none of `lines` ("noLine"), or `known` (the file's rows) has it ("known").
pub fn check(rows: Vec<(String, String)>, lines: &[String], known: &HashSet<String>) -> Vec<Row> {
    let mut seen = known.clone();
    rows.into_iter()
        .map(|(en, zh)| {
            let dict = Dictionary::of(&[(en.clone(), zh.clone())]);
            let covered: Vec<String> = lines.iter().filter(|l| dict.translate(l).is_some()).cloned().collect();
            let why = if holes(&en) != holes(&zh) {
                "holes"
            } else if covered.is_empty() {
                "noLine"
            } else if !seen.insert(en.clone()) {
                "known"
            } else {
                ""
            };
            Row { en, zh, lines: covered, why: why.into() }
        })
        .collect()
}

/// The rows of a CSV of the dictionary's (no header).
fn rows_of(data: &[u8]) -> Vec<(String, String)> {
    let mut reader = csv::ReaderBuilder::new().has_headers(false).flexible(true).from_reader(data);
    reader
        .records()
        .flatten()
        .filter(|r| r.len() >= 2)
        .map(|r| (r[0].trim_start_matches('\u{feff}').to_string(), r[1].to_string()))
        .collect()
}

/// `data` (a CSV of the dictionary's, or nothing) with `rows` after it, each quoted, those it has left out.
fn appended(data: &[u8], rows: &[(String, String)]) -> (Vec<u8>, usize) {
    let known: HashSet<String> = rows_of(data).into_iter().map(|(en, _)| en).collect();
    let mut out = data.to_vec();
    if out.is_empty() {
        out.extend_from_slice("\"## POBT's translation check: rows an AI translated, for what the other files have not\",\"\"\n".as_bytes());
    } else if !out.ends_with(b"\n") {
        out.push(b'\n');
    }
    let mut added = 0;
    let mut writer = csv::WriterBuilder::new().quote_style(csv::QuoteStyle::Always).from_writer(Vec::new());
    for (en, zh) in rows.iter().filter(|(en, _)| !known.contains(en)) {
        if writer.write_record([en, zh]).is_ok() {
            added += 1;
        }
    }
    out.extend(writer.into_inner().unwrap_or_default());
    (out, added)
}

fn append(file: &PathBuf, rows: &[(String, String)]) -> std::io::Result<()> {
    let (data, _) = appended(&std::fs::read(file).unwrap_or_default(), rows);
    std::fs::write(file, data)
}

/// `gh` with `args`, `body` (JSON) on its stdin if any: what it printed, or why it failed.
fn gh(args: &[&str], body: Option<&Value>) -> Result<String, String> {
    let program = ai::find_program("gh").ok_or("noGh")?;
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(ai::CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("gh: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("gh: no stdin")?;
    let input = body.map(Value::to_string).unwrap_or_default();
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(input.as_bytes());
    });
    let out = child.wait_with_output().map_err(|e| format!("gh: {e}"))?;
    let _ = writer.join();
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(format!("gh {}: {}", args.first().unwrap_or(&""), String::from_utf8_lossy(&out.stderr).trim()))
    }
}

/// Whether `gh` is there and signed in to GitHub.
pub fn gh_ready() -> bool {
    gh(&["auth", "status"], None).is_ok()
}

/// What to offer: `rows` of `language`, translated by `agent` from the build `build`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Offer {
    pub agent: String,
    pub language: String,
    pub build: String,
    pub rows: Vec<Row>,
}

/// Offers the rows to POBT as a pull request with `gh`: on a branch of POBT's own repository when the user may push
/// to it, else of their fork (made if need be), `trs/<language>/POBT-ai.csv` with the rows it has not; the pull
/// request's address.
pub fn submit(offer: &Offer) -> Result<String, String> {
    let rows: Vec<(String, String)> = offer.rows.iter().filter(|r| r.why.is_empty()).map(|r| (r.en.clone(), r.zh.clone())).collect();
    if rows.is_empty() || offer.language.contains(['/', '\\', '.']) {
        return Err("nothingNew".into());
    }
    let login = gh(&["api", "user", "--jq", ".login"], None)?;
    let push = gh(&["api", &format!("repos/{UPSTREAM}"), "--jq", ".permissions.push"], None)? == "true";
    let repo = if push {
        UPSTREAM.to_string()
    } else {
        gh(&["repo", "fork", UPSTREAM, "--clone=false"], None)?;
        let fork = format!("{login}/pobt");
        // the fork as POBT is now, for the branch to start from POBT's last commit
        let _ = gh(&["api", "-X", "POST", &format!("repos/{fork}/merge-upstream"), "--input", "-"], Some(&json!({ "branch": "main" })));
        fork
    };
    let sha = gh(&["api", &format!("repos/{UPSTREAM}/git/ref/heads/main"), "--jq", ".object.sha"], None)?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let branch = format!("trs-ai/{}-{now}", offer.language);
    gh(&["api", "-X", "POST", &format!("repos/{repo}/git/refs"), "--input", "-"], Some(&json!({ "ref": format!("refs/heads/{branch}"), "sha": sha })))?;

    let path = format!("trs/{}/{FILE}", offer.language);
    let b64 = base64::engine::general_purpose::STANDARD;
    let (old, old_sha) = match gh(&["api", &format!("repos/{repo}/contents/{path}?ref={branch}")], None) {
        Ok(json) => {
            let v: Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            let content: String = v["content"].as_str().unwrap_or("").chars().filter(|c| !c.is_whitespace()).collect();
            (b64.decode(content).unwrap_or_default(), v["sha"].as_str().map(str::to_string))
        }
        Err(_) => (Vec::new(), None),
    };
    let (data, added) = appended(&old, &rows);
    if added == 0 {
        return Err("nothingNew".into());
    }
    let what = format!("trs: {added} {} rows from {}, by POBT's translation check", offer.language, offer.build);
    let mut put = json!({ "message": what, "content": b64.encode(&data), "branch": branch });
    if let Some(s) = old_sha {
        put["sha"] = json!(s);
    }
    gh(&["api", "-X", "PUT", &format!("repos/{repo}/contents/{path}"), "--input", "-"], Some(&put))?;

    let table: String = rows.iter().map(|(en, zh)| format!("| {} | {} |\n", en.replace('|', "\\|"), zh.replace('|', "\\|"))).collect();
    let agent = match offer.agent.as_str() {
        "claude" => "Claude Code",
        "codex" => "Codex",
        other => other,
    };
    let body = format!(
        "## Description\n\nText of the build \"{}\" that POBT showed in English in `{}`, translated by {agent} in POBT's translation check (it read `trs/{}` to word it as the dictionary does) and checked by POBT: each row's holes match, and it translates a line of that build.\n\n| English | Translation |\n|---|---|\n{table}\n🤖 Generated with POBT's translation check",
        offer.build, offer.language, offer.language,
    );
    let head = if push { branch.clone() } else { format!("{login}:{branch}") };
    gh(&["api", "-X", "POST", &format!("repos/{UPSTREAM}/pulls"), "--jq", ".html_url", "--input", "-"], Some(&json!({ "title": what, "head": head, "base": "main", "body": body })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn finds_the_rows_in_an_answer() {
        let text = "Here:\n```json\n{\"rows\": [{\"en\": \"Gain {0} Life\", \"zh\": \"获得 {0} 生命\"}, {\"en\": \"\", \"zh\": \"x\"}]}\n```";
        assert_eq!(answer(text), Some(vec![("Gain {0} Life".into(), "获得 {0} 生命".into())]));
        assert_eq!(answer("no json"), None);
    }

    /// A row is kept when its holes match and it translates a line asked for, once.
    #[test]
    fn checks_each_row() {
        let lines = s(&["Gain 24 Life per Enemy Killed", "Storm Mitts"]);
        let known: HashSet<String> = ["Storm Mitts".to_string()].into();
        let rows = check(
            vec![
                ("Gain {0} Life per Enemy Killed".into(), "每击败一个敌人获得 {0} 生命".into()),
                ("Gain {0} Mana per Enemy Killed".into(), "每击败一个敌人获得 {0} 魔力".into()),
                ("Gain {0} Life per Enemy Killed".into(), "每击败一个敌人获得生命".into()),
                ("Storm Mitts".into(), "风暴 手套".into()),
            ],
            &lines,
            &known,
        );
        let why: Vec<&str> = rows.iter().map(|r| r.why.as_str()).collect();
        assert_eq!(why, ["", "noLine", "holes", "known"]);
        assert_eq!(rows[0].lines, s(&["Gain 24 Life per Enemy Killed"]));
    }

    /// The file gets a first line when it is new, and only rows it has not.
    #[test]
    fn appends_rows_it_has_not() {
        let rows = vec![("A \"quoted\" line".to_string(), "一行".to_string()), ("B".to_string(), "乙".to_string())];
        let (first, added) = appended(b"", &rows);
        assert_eq!(added, 2);
        let text = String::from_utf8(first.clone()).unwrap();
        assert!(text.starts_with("\"## "));
        assert!(text.contains("\"A \"\"quoted\"\" line\",\"一行\"\n"));
        let (again, added) = appended(&first, &[("B".to_string(), "乙".to_string()), ("C".to_string(), "丙".to_string())]);
        assert_eq!(added, 1);
        assert!(String::from_utf8(again).unwrap().ends_with("\"C\",\"丙\"\n"));
        // read as the dictionary reads it: the first line is no row
        let dict = Dictionary::of(&rows_of(&first));
        assert_eq!(dict.translate("B").as_deref(), Some("乙"));
        assert_eq!(dict.translate("A \"quoted\" line").as_deref(), Some("一行"));
    }

    #[test]
    fn asks_for_the_lines_in_the_language() {
        let p = prompt(&Request { agent: "claude".into(), language: "zh-rCN".into(), build: "Xiaobo".into(), lines: s(&["Storm Mitts", "Gain 24 Life"]) });
        assert!(p.contains("Simplified Chinese"));
        assert!(p.contains("\"Xiaobo\":\nStorm Mitts\nGain 24 Life\n"));
        assert!(p.contains("{0}"));
    }

    /// The agent on this machine (`POBT_AGENT`, "claude" by default) translating lines of a build; its rows are kept in
    /// the source tree's `trs/zh-rCN/POBT-ai.csv`.
    #[test]
    #[ignore]
    fn live_fill() {
        let lines = s(&["Bottomless Quartz Flask of the Cheetah", "Brewer's Quicksilver Flask of the Owl", "The Covetous Dark", "Gain 37 Life per Enemy Hit with Attacks"]);
        let agent = std::env::var("POBT_AGENT").unwrap_or("claude".into());
        let (report, text) = fill(&Request { agent, language: "zh-rCN".into(), build: "Xiaobo_Covens".into(), lines }).unwrap();
        println!("{text}\n{}", serde_json::to_string_pretty(&report).unwrap());
    }
}
