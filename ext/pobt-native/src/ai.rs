//! Builds analysed by an AI already on the user's machine: Claude Code (`claude`) or Codex (`codex`), found on the
//! PATH. The build, a POB `.xml` or a build code, is boiled down to what an analyst reads (POB's computed stats,
//! skills, items, configuration) and given to the agent on stdin, with no tools; its answer is a report by
//! dimension (offence, defence, recovery…) as JSON, for the launcher's Analysis page.

use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::account::Entry;

/// An agent the user has: `id` "claude" or "codex", and where its program is.
#[derive(Debug, Clone, Serialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub path: String,
}

const AGENTS: [(&str, &str); 2] = [("claude", "Claude Code"), ("codex", "Codex")];

/// The agents on the PATH (or where their installers put them), Claude Code first.
pub fn agents() -> Vec<Agent> {
    AGENTS
        .iter()
        .filter_map(|(id, name)| find_program(id).map(|p| Agent { id: id.to_string(), name: name.to_string(), path: p.display().to_string() }))
        .collect()
}

/// `name`'s program on the PATH: on Windows a `.exe`, or the `.cmd` npm makes.
fn find_program(name: &str) -> Option<PathBuf> {
    let exts: &[&str] = if cfg!(windows) { &[".exe", ".cmd", ".bat"] } else { &[""] };
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    // Where Claude Code's own installer puts it, which a program started from the desktop may not have on its PATH.
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".claude").join("local"));
    }
    if let Some(data) = dirs::data_dir() {
        dirs.push(data.join("npm"));
    }
    dirs.iter().flat_map(|d| exts.iter().map(move |e| d.join(format!("{name}{e}")))).find(|p| p.is_file())
}

/// A folder of builds: where POB keeps them (its `buildPath`, or `Builds` beside its settings), and what is in it.
#[derive(Debug, Clone, Serialize)]
pub struct Root {
    pub root: String,
    pub tree: Vec<Entry>,
}

/// POB's builds folders: each of `pob_dirs` (a portable POB) and the user's documents' (an installed one), as each
/// one's `Settings.xml` names it or by default, those there.
pub fn roots(pob_dirs: &[PathBuf]) -> Vec<Root> {
    let mut bases: Vec<PathBuf> = pob_dirs.to_vec();
    if let Some(docs) = dirs::document_dir() {
        bases.push(docs.join("Path of Building"));
        bases.push(docs.join("Path of Building (PoE2)"));
    }
    let mut seen: Vec<PathBuf> = Vec::new();
    for base in bases {
        let set = std::fs::read_to_string(base.join("Settings.xml")).ok().and_then(|xml| build_path(&xml));
        for dir in set.into_iter().chain([base.join("Builds")]) {
            let key = std::fs::canonicalize(&dir).unwrap_or_else(|_| dir.clone());
            if dir.is_dir() && !seen.contains(&key) {
                seen.push(key);
            }
        }
    }
    seen.into_iter()
        .map(|dir| {
            let shown = dir.display().to_string();
            let shown = shown.strip_prefix(r"\\?\").unwrap_or(&shown).to_string();
            Root { tree: crate::account::entries(&dir, "", 6, &mut 2000), root: shown }
        })
        .collect()
}

/// The `buildPath` POB's `Settings.xml` sets, if one.
fn build_path(xml: &str) -> Option<PathBuf> {
    let doc = roxmltree::Document::parse(xml).ok()?;
    let path = doc.descendants().find_map(|n| n.attribute("buildPath"))?.trim();
    (!path.is_empty()).then(|| PathBuf::from(path.trim_end_matches(['/', '\\'])))
}

/// What to analyse: the build at `path` (a POB `.xml`) or the build `code`, by `agent`, its words in `language`
/// ("Simplified Chinese"…), `question` the user's own, if any.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Request {
    pub agent: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub question: String,
}

/// The analysis running or last run. `state`: "running", "done", "failed" or "cancelled"; `step`: "reading",
/// "thinking"; `activity`: what the agent last said it does; `report`: its answer as JSON, else `raw`, its text.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Progress {
    pub state: String,
    pub agent: String,
    pub build: String,
    pub step: String,
    pub activity: String,
    pub error: String,
    pub report: Value,
    pub raw: String,
}

static JOB: Mutex<Option<Progress>> = Mutex::new(None);
/// The agent's process while it runs, to stop it.
static CHILD: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);
static CANCEL: AtomicBool = AtomicBool::new(false);

pub fn progress() -> Option<Progress> {
    JOB.lock().unwrap().clone()
}

fn update(f: impl FnOnce(&mut Progress)) {
    if let Some(p) = JOB.lock().unwrap().as_mut() {
        f(p);
    }
}

/// Starts an analysis in the background; false while one runs.
pub fn start(request: Request) -> bool {
    {
        let mut job = JOB.lock().unwrap();
        if job.as_ref().is_some_and(|p| p.state == "running") {
            return false;
        }
        *job = Some(Progress { state: "running".into(), agent: request.agent.clone(), step: "reading".into(), ..Default::default() });
    }
    CANCEL.store(false, Ordering::SeqCst);
    std::thread::spawn(move || {
        let out = analyse(&request);
        if let Err(e) = &out {
            log::warn!("ai {}: {e}", request.agent);
        }
        let cancelled = CANCEL.load(Ordering::SeqCst);
        update(|p| match out {
            _ if cancelled => p.state = "cancelled".into(),
            Ok((report, raw)) => {
                p.state = "done".into();
                p.report = report;
                p.raw = raw;
            }
            Err(e) => {
                p.state = "failed".into();
                p.error = e;
            }
        });
    });
    true
}

/// Stops the analysis running, if one.
pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
    if let Some(child) = CHILD.lock().unwrap().as_ref() {
        kill(&mut child.lock().unwrap());
    }
}

/// The agent's process and what it started: npm's `.cmd` runs node under `cmd`, which killing alone leaves going.
fn kill(child: &mut Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill").args(["/T", "/F", "/PID", &child.id().to_string()]).creation_flags(CREATE_NO_WINDOW).status();
    }
    let _ = child.kill();
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn analyse(req: &Request) -> Result<(Value, String), String> {
    let (name, xml) = read_build(req)?;
    update(|p| p.build = name.clone());
    let digest = digest(&xml)?;
    let prompt = prompt(&digest, &req.language, &req.question);
    update(|p| p.step = "thinking".into());
    let text = run_agent(&req.agent, &prompt)?;
    Ok(match report(&text) {
        Some(report) => (report, text),
        None => (Value::Null, text),
    })
}

/// The build's name and XML.
fn read_build(req: &Request) -> Result<(String, String), String> {
    if !req.code.trim().is_empty() {
        let xml = decode_code(&req.code).ok_or("badCode")?;
        return Ok((String::new(), xml));
    }
    let path = Path::new(&req.path);
    let xml = std::fs::read_to_string(path).map_err(|_| "noBuild".to_string())?;
    let name = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    Ok((name, xml))
}

/// A POB build code (URL-safe base64 of the zlib'd XML) as its XML.
pub fn decode_code(code: &str) -> Option<String> {
    let code: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    let code = code.replace('+', "-").replace('/', "_");
    let bytes = base64::engine::GeneralPurpose::new(
        &base64::alphabet::URL_SAFE,
        base64::engine::GeneralPurposeConfig::new().with_decode_padding_mode(base64::engine::DecodePaddingMode::Indifferent),
    )
    .decode(code.trim_end_matches('='))
    .ok()?;
    let mut xml = String::new();
    flate2::read::ZlibDecoder::new(&bytes[..]).read_to_string(&mut xml).ok()?;
    xml.contains("<PathOfBuilding").then_some(xml)
}

/// What an analyst reads of a POB build, as text: the character, the stats POB computed, the skills, the items
/// worn, the tree in brief, the configuration and the notes.
pub fn digest(xml: &str) -> Result<String, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|_| "badBuild".to_string())?;
    let root = doc.root_element();
    let build = child(root, "Build").ok_or("badBuild")?;
    let attr = |n: roxmltree::Node<'_, '_>, a: &str| n.attribute(a).unwrap_or("").to_string();
    let mut out = String::new();
    let mut line = |s: String| {
        out.push_str(&s);
        out.push('\n');
    };

    line("# Character".into());
    line(format!("Level {} {} / {}", attr(build, "level"), attr(build, "className"), attr(build, "ascendClassName")));
    for a in ["targetVersion", "bandit", "pantheonMajorGod", "pantheonMinorGod"] {
        if let Some(v) = build.attribute(a) {
            line(format!("{a}: {v}"));
        }
    }

    line("\n# Stats Path of Building computed (main skill, configuration below)".into());
    for s in build.children().filter(|c| c.has_tag_name("PlayerStat")) {
        let value = s.attribute("value").unwrap_or("");
        let value = value.parse::<f64>().map(|v| format!("{}", (v * 100.0).round() / 100.0)).unwrap_or(value.to_string());
        line(format!("{}: {value}", attr(s, "stat")));
    }
    for minion in build.children().filter(|c| c.has_tag_name("MinionStat")) {
        line(format!("Minion {}: {}", attr(minion, "stat"), attr(minion, "value")));
    }

    if let Some(skills) = child(root, "Skills") {
        line("\n# Skills (socket groups; * the main one)".into());
        let main: usize = build.attribute("mainSocketGroup").and_then(|v| v.parse().ok()).unwrap_or(0);
        let active = skills.attribute("activeSkillSet").unwrap_or("1");
        // POB 2.x keeps them in skill sets; older builds right in `Skills`.
        let set = skills.children().filter(|c| c.has_tag_name("SkillSet")).find(|s| s.attribute("id") == Some(active)).unwrap_or(skills);
        for (i, skill) in set.children().filter(|c| c.has_tag_name("Skill")).enumerate() {
            let gems: Vec<String> = skill
                .children()
                .filter(|g| g.has_tag_name("Gem"))
                .map(|g| {
                    let name = g.attribute("nameSpec").filter(|n| !n.is_empty()).or(g.attribute("skillId")).unwrap_or("?");
                    let off = if g.attribute("enabled") == Some("false") { " (off)" } else { "" };
                    format!("{name} {}/{}{off}", attr(g, "level"), attr(g, "quality"))
                })
                .collect();
            if gems.is_empty() {
                continue;
            }
            let mark = if i + 1 == main { "*" } else { "-" };
            let off = if skill.attribute("enabled") == Some("false") { " (disabled)" } else { "" };
            let label = attr(skill, "label");
            let label = if label.is_empty() { String::new() } else { format!("{label}: ") };
            line(format!("{mark} [{}] {label}{}{off}", attr(skill, "slot"), gems.join(", ")));
        }
    }

    if let Some(items) = child(root, "Items") {
        let by_id: std::collections::HashMap<&str, roxmltree::Node<'_, '_>> =
            items.children().filter(|c| c.has_tag_name("Item")).filter_map(|i| Some((i.attribute("id")?, i))).collect();
        let active = items.attribute("activeItemSet").unwrap_or("1");
        let set = items.children().filter(|c| c.has_tag_name("ItemSet")).find(|s| s.attribute("id") == Some(active)).unwrap_or(items);
        let mut slots: Vec<(String, &str)> = set
            .children()
            .filter(|c| c.has_tag_name("Slot"))
            .filter_map(|s| Some((attr(s, "name"), s.attribute("itemId").filter(|id| *id != "0")?)))
            .collect();
        // The jewels in the tree.
        if let Some(tree) = child(root, "Tree") {
            let spec = active_spec(tree);
            for socket in spec.into_iter().flat_map(|s| s.descendants().filter(|c| c.has_tag_name("Socket"))) {
                if let Some(id) = socket.attribute("itemId").filter(|id| *id != "0") {
                    slots.push((format!("Tree jewel (node {})", attr(socket, "nodeId")), id));
                }
            }
        }
        line("\n# Items worn".into());
        for (slot, id) in slots {
            let Some(item) = by_id.get(id) else { continue };
            line(format!("## {slot}"));
            for text in item_text(*item) {
                line(text);
            }
        }
    }

    if let Some(spec) = child(root, "Tree").and_then(active_spec) {
        line("\n# Passive tree".into());
        let nodes = spec.attribute("nodes").map(|n| n.split(',').filter(|s| !s.is_empty()).count()).unwrap_or(0);
        let masteries = spec.attribute("masteryEffects").map(|m| m.matches('{').count()).unwrap_or(0);
        line(format!("{} ({}): {nodes} nodes allocated, {masteries} masteries", attr(spec, "title"), attr(spec, "treeVersion")));
        line("Node names are not given: judge the tree by the stats above.".into());
    }

    if let Some(config) = child(root, "Config") {
        line("\n# Configuration (the conditions POB's stats assume)".into());
        let active = config.attribute("activeConfigSet");
        let set = config.children().filter(|c| c.has_tag_name("ConfigSet")).find(|s| s.attribute("id") == active).unwrap_or(config);
        for input in set.children().filter(|c| c.has_tag_name("Input")) {
            let value = ["boolean", "number", "string"].iter().find_map(|k| input.attribute(*k)).unwrap_or("");
            line(format!("{}: {value}", attr(input, "name")));
        }
    }

    if let Some(notes) = child(root, "Notes").and_then(|n| n.text()).map(str::trim).filter(|n| !n.is_empty()) {
        line("\n# The author's notes".into());
        line(strip_colours(notes).chars().take(3000).collect());
    }
    Ok(out)
}

/// `n`'s first child named `tag`.
fn child<'a, 'i>(n: roxmltree::Node<'a, 'i>, tag: &str) -> Option<roxmltree::Node<'a, 'i>> {
    n.children().find(|c| c.has_tag_name(tag))
}

/// The passive tree in use.
fn active_spec<'a, 'i>(tree: roxmltree::Node<'a, 'i>) -> Option<roxmltree::Node<'a, 'i>> {
    let specs: Vec<_> = tree.children().filter(|c| c.has_tag_name("Spec")).collect();
    let active: usize = tree.attribute("activeSpec").and_then(|v| v.parse().ok()).unwrap_or(1);
    specs.get(active.saturating_sub(1)).or(specs.first()).copied()
}

/// An item's text as POB shows it: no blank lines, no `{tags}` before its mods.
fn item_text(item: roxmltree::Node<'_, '_>) -> Vec<String> {
    let text: String = item.children().filter(|c| c.is_text()).filter_map(|c| c.text()).collect();
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .filter(|l| !["Unique ID:", "Item Level:", "LevelReq:", "Implicits:", "Prefix:", "Suffix:", "Catalyst"].iter().any(|p| l.starts_with(p)))
        .map(|l| {
            let mut l = l;
            while l.starts_with('{') {
                match l.find('}') {
                    Some(end) => l = &l[end + 1..],
                    None => break,
                }
            }
            l.to_string()
        })
        .collect()
}

/// POB's colour codes (`^7`, `^xRRGGBB`) out.
fn strip_colours(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '^' {
            match chars.peek() {
                Some(d) if d.is_ascii_digit() => {
                    chars.next();
                    continue;
                }
                Some('x') => {
                    chars.next();
                    for _ in 0..6 {
                        chars.next();
                    }
                    continue;
                }
                _ => {}
            }
        }
        out.push(c);
    }
    out
}

/// The dimensions of a report, in their order.
pub const DIMENSIONS: [&str; 6] = ["offence", "defence", "recovery", "ailments", "utility", "gear"];

/// What the agent is asked: the report's JSON, then the build.
pub fn prompt(digest: &str, language: &str, question: &str) -> String {
    let language = if language.trim().is_empty() { "English" } else { language.trim() };
    let question = if question.trim().is_empty() { String::new() } else { format!("\nThe player also asks, answer it in `summary` and the dimensions it concerns: {}\n", question.trim()) };
    format!(
        r#"You are an expert Path of Exile build analyst. Below is a character build from Path of Building (for Path of Exile, or Path of Exile 2 when its targetVersion says so): the stats POB computed for its main skill, its skills, items, tree and configuration. Analyse it for endgame play (red maps, pinnacle bosses) and answer with ONE JSON object only — no prose around it, no code fence — of this shape:

{{
  "title": "the build in a few words: main skill and ascendancy",
  "summary": "two or three sentences: what the build does well and what holds it back",
  "score": 0-100, how ready it is for the endgame,
  "dimensions": [
    {{
      "key": "offence",
      "score": 0-10,
      "verdict": "one sentence",
      "metrics": [{{ "label": "a short name", "value": "a number from the stats, formatted (e.g. 1.2M)" }}],
      "strengths": ["…"],
      "weaknesses": ["…"],
      "suggestions": ["a concrete change: a gem, an item mod, a passive cluster, a config"]
    }}
  ],
  "priorities": ["the most impactful changes, most important first, at most five"]
}}

Give all six dimensions, in this order, with these keys:
- "offence": damage — DPS against bosses and for clearing, hit and damage over time, crit, how it scales, what the configuration assumes.
- "defence": not dying to big hits — life/ES pool, maximum hit taken by type, resistances (and overcap), armour, evasion, block, suppression, damage taken as/reduction, layers missing.
- "recovery": regeneration, leech, recoup, life/ES/mana on hit or kill, flasks, mana sustain.
- "ailments": freeze, chill, shock, ignite, bleed, poison, stun, curses, corrupted blood, reflect — immune, avoided or exposed.
- "utility": movement speed, clear speed, auras and reservation, quality of life.
- "gear": the weakest slots, the upgrades that matter most, the jewels.
Two to four metrics, and one to four of each list, per dimension. Base every judgement on the numbers given; when something is not in the build, say it is unknown rather than guess. Write every text value in {language}; keep the names of skills, items and mods as the game's {language} client names them if you know them, else in English.
{question}
=== BUILD ===
{digest}"#
    )
}

/// The agent's answer, `prompt` on its stdin; its last message.
fn run_agent(agent: &str, prompt: &str) -> Result<String, String> {
    let program = find_program(agent).ok_or("noAgent")?;
    // Somewhere of its own: the agents read the folder they start in.
    let work = std::env::temp_dir().join("pobt-ai");
    let _ = std::fs::create_dir_all(&work);
    let last = work.join(format!("last-{}.txt", std::process::id()));
    let _ = std::fs::remove_file(&last);
    let mut cmd = Command::new(&program);
    match agent {
        "claude" => {
            cmd.args(["-p", "--output-format", "text", "--no-session-persistence", "--tools", ""]);
        }
        "codex" => {
            cmd.args(["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral", "--color", "never", "-o"]).arg(&last).arg("-");
        }
        _ => return Err("noAgent".into()),
    }
    cmd.current_dir(&work).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("agentFailed: {}: {e}", program.display()))?;
    let mut stdin = child.stdin.take().ok_or("agentFailed: no stdin")?;
    let stdout = child.stdout.take().ok_or("agentFailed: no stdout")?;
    let stderr = child.stderr.take().ok_or("agentFailed: no stderr")?;
    let child = Arc::new(Mutex::new(child));
    *CHILD.lock().unwrap() = Some(child.clone());
    let prompt = prompt.to_string();
    std::thread::spawn(move || {
        let _ = stdin.write_all(prompt.as_bytes());
    });
    let out = std::thread::spawn(move || read_lines(stdout));
    let err = std::thread::spawn(move || read_lines(stderr));
    let status = loop {
        if let Some(status) = child.lock().unwrap().try_wait().map_err(|e| format!("agentFailed: {e}"))? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    *CHILD.lock().unwrap() = None;
    let out = out.join().unwrap_or_default();
    let err = err.join().unwrap_or_default();
    if CANCEL.load(Ordering::SeqCst) {
        return Err("cancelled".into());
    }
    let text = std::fs::read_to_string(&last).ok().filter(|t| !t.trim().is_empty()).unwrap_or(out);
    let _ = std::fs::remove_file(&last);
    if !status.success() || text.trim().is_empty() {
        let why = if err.trim().is_empty() { &text } else { &err };
        let tail: String = why.trim().lines().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("agentFailed: {tail}"));
    }
    Ok(text)
}

/// All of `r`, each line said as the agent's activity as it comes.
fn read_lines(r: impl Read) -> String {
    use std::io::BufRead;
    let mut all = String::new();
    for line in std::io::BufReader::new(r).lines().map_while(Result::ok) {
        let shown = line.trim();
        if !shown.is_empty() {
            let shown: String = shown.chars().take(160).collect();
            update(|p| p.activity = shown);
        }
        all.push_str(&line);
        all.push('\n');
    }
    all
}

/// The report in the agent's answer: its JSON object, from its first `{` to its last `}` (any fence or words
/// around it left out), with `dimensions` an array.
pub fn report(text: &str) -> Option<Value> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    let value: Value = serde_json::from_str(text.get(start..=end)?).ok()?;
    value.get("dimensions")?.as_array()?;
    Some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUILD: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
	<Build level="93" className="Witch" ascendClassName="Elementalist" mainSocketGroup="2" bandit="None">
		<PlayerStat stat="TotalDPS" value="30440.360606061"/>
		<PlayerStat stat="Life" value="4512"/>
	</Build>
	<Skills activeSkillSet="1">
		<SkillSet id="1">
			<Skill slot="Helmet" enabled="true" label=""><Gem nameSpec="Hatred" level="20" quality="0" enabled="true"/></Skill>
			<Skill slot="Body Armour" enabled="true" label="Main"><Gem nameSpec="Fireball" level="21" quality="20" enabled="true"/><Gem nameSpec="Ignite Proliferation" level="20" quality="0" enabled="false"/></Skill>
		</SkillSet>
	</Skills>
	<Tree activeSpec="1">
		<Spec title="Lv 93" treeVersion="3_25" nodes="1,2,3" masteryEffects="{1,2}">
			<Sockets><Socket nodeId="26725" itemId="2"/></Sockets>
		</Spec>
	</Tree>
	<Items activeItemSet="1">
		<Item id="1">
			Rarity: RARE
			Doom Visor
			Hubris Circlet
			Unique ID: abc
			Item Level: 84
			{range:0.5}+80 to maximum Life
			{crafted}+30% to Fire Resistance
		</Item>
		<Item id="2">
			Rarity: UNIQUE
			Watcher's Eye
			Prismatic Jewel
		</Item>
		<ItemSet id="1"><Slot name="Helmet" itemId="1"/><Slot name="Gloves" itemId="0"/></ItemSet>
	</Items>
	<Config><Input name="enemyIsBoss" string="Pinnacle"/><Input name="conditionStationary" boolean="true"/></Config>
	<Notes>^7Ignite ^x88FF00league starter</Notes>
</PathOfBuilding>"#;

    #[test]
    fn digests_a_build() {
        let d = digest(BUILD).unwrap();
        assert!(d.contains("Level 93 Witch / Elementalist"), "{d}");
        assert!(d.contains("TotalDPS: 30440.36"), "{d}");
        assert!(d.contains("* [Body Armour] Main: Fireball 21/20, Ignite Proliferation 20/0 (off)"), "{d}");
        assert!(d.contains("- [Helmet] Hatred 20/0"), "{d}");
        assert!(d.contains("## Helmet\nRarity: RARE\nDoom Visor\nHubris Circlet\n+80 to maximum Life\n+30% to Fire Resistance\n"), "{d}");
        assert!(!d.contains("Unique ID"), "{d}");
        assert!(d.contains("## Tree jewel (node 26725)\nRarity: UNIQUE\nWatcher's Eye"), "{d}");
        assert!(d.contains("Lv 93 (3_25): 3 nodes allocated, 1 masteries"), "{d}");
        assert!(d.contains("enemyIsBoss: Pinnacle"), "{d}");
        assert!(d.contains("Ignite league starter"), "{d}");
        assert!(!d.contains("Gloves"), "{d}");
    }

    #[test]
    fn decodes_a_build_code() {
        use flate2::{Compression, write::ZlibEncoder};
        let mut z = ZlibEncoder::new(Vec::new(), Compression::default());
        z.write_all(BUILD.as_bytes()).unwrap();
        let code = base64::engine::general_purpose::URL_SAFE.encode(z.finish().unwrap());
        assert_eq!(decode_code(&format!("  {code}\n")).as_deref(), Some(BUILD));
        assert_eq!(decode_code("not a code"), None);
    }

    #[test]
    fn finds_the_report_in_an_answer() {
        let r = report("Here it is:\n```json\n{\"score\": 70, \"dimensions\": [{\"key\": \"offence\"}]}\n```").unwrap();
        assert_eq!(r["score"], 70);
        assert!(report("{\"score\": 70}").is_none());
        assert!(report("no json").is_none());
    }

    #[test]
    fn reads_the_build_path_of_pob_settings() {
        let xml = r#"<PathOfBuilding><Misc buildPath="C:\Users\x\Documents\My Games\POB\Builds/" /></PathOfBuilding>"#;
        assert_eq!(build_path(xml), Some(PathBuf::from(r"C:\Users\x\Documents\My Games\POB\Builds")));
        assert_eq!(build_path("<PathOfBuilding><Misc buildPath=\"\"/></PathOfBuilding>"), None);
    }

    /// A real analysis: `POBT_AI_BUILD` a build's file, `POBT_AI_AGENT` "claude" or "codex".
    /// `cargo test --lib ai::tests::analyses_a_build -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn analyses_a_build() {
        let path = std::env::var("POBT_AI_BUILD").expect("POBT_AI_BUILD");
        let agent = std::env::var("POBT_AI_AGENT").unwrap_or("claude".into());
        let req = Request { agent, path, language: "Simplified Chinese".into(), ..Default::default() };
        let (_, xml) = read_build(&req).unwrap();
        eprintln!("{}", digest(&xml).unwrap());
        let (report, raw) = analyse(&req).unwrap();
        eprintln!("{raw}");
        assert_eq!(report["dimensions"].as_array().map(Vec::len), Some(6), "{raw}");
    }

    #[test]
    fn asks_for_every_dimension_in_the_language() {
        let p = prompt("DIGEST", "Simplified Chinese", "Can it do Uber Eater?");
        for d in DIMENSIONS {
            assert!(p.contains(&format!("\"{d}\"")), "{d}");
        }
        assert!(p.contains("in Simplified Chinese"));
        assert!(p.contains("Uber Eater"));
        assert!(p.ends_with("DIGEST"));
    }
}
