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
pub(crate) fn find_program(name: &str) -> Option<PathBuf> {
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
    /// The build's name, for one given as a code.
    #[serde(default)]
    pub name: String,
    /// The build's file to keep the report beside (`<name>.ai.json`, see [`saved_path`]) once done; "" for none.
    #[serde(default)]
    pub save_to: String,
}

/// The analysis running or last run. `state`: "running", "done", "failed" or "cancelled"; `step`: "reading" (the
/// build), "starting" (the agent), "waiting" (for its first words), "thinking", "writing" (its answer), "parsing" (the
/// report in it); `activity`: the last of what it streams; `received`: how many characters of its answer have come;
/// `report`: its answer as JSON, else `raw`, its text; `finished`: when it ended (Unix seconds); `save_to`: the
/// build's file the report is kept beside, if any.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Progress {
    pub state: String,
    pub agent: String,
    pub build: String,
    pub step: String,
    pub activity: String,
    pub received: usize,
    pub error: String,
    pub report: Value,
    pub raw: String,
    pub finished: u64,
    pub language: String,
    pub question: String,
    pub save_to: String,
}

/// A job of an agent's, one at a time: how far it is, the agent's process while it runs (to stop it), and whether it
/// was stopped. The analysis has one, the translation (`trfill`) another.
pub struct Job {
    progress: Mutex<Option<Progress>>,
    child: Mutex<Option<Arc<Mutex<Child>>>>,
    cancel: AtomicBool,
}

impl Job {
    pub const fn new() -> Self {
        Self { progress: Mutex::new(None), child: Mutex::new(None), cancel: AtomicBool::new(false) }
    }

    pub fn progress(&self) -> Option<Progress> {
        self.progress.lock().unwrap().clone()
    }

    pub fn update(&self, f: impl FnOnce(&mut Progress)) {
        if let Some(p) = self.progress.lock().unwrap().as_mut() {
            f(p);
        }
    }

    pub fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// Starts `work` in the background from `first` (as "running"); false while one runs. Its result is the report
    /// (JSON) and the agent's text; `then` sees the job once it has ended.
    pub fn start(
        &'static self,
        first: Progress,
        work: impl FnOnce() -> Result<(Value, String), String> + Send + 'static,
        then: impl FnOnce(&Progress) + Send + 'static,
    ) -> bool {
        {
            let mut job = self.progress.lock().unwrap();
            if job.as_ref().is_some_and(|p| p.state == "running") {
                return false;
            }
            *job = Some(Progress { state: "running".into(), ..first });
        }
        self.cancel.store(false, Ordering::SeqCst);
        std::thread::spawn(move || {
            let out = work();
            if let Err(e) = &out {
                log::warn!("ai: {e}");
            }
            let cancelled = self.cancelled();
            let finished = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            self.update(|p| {
                p.finished = finished;
                match out {
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
                }
            });
            if let Some(p) = self.progress() {
                then(&p);
            }
        });
        true
    }

    /// Stops the job running, if one.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Some(child) = self.child.lock().unwrap().as_ref() {
            kill(&mut child.lock().unwrap());
        }
    }
}

static ANALYSIS: Job = Job::new();

pub fn progress() -> Option<Progress> {
    ANALYSIS.progress()
}

/// Starts an analysis in the background; false while one runs.
pub fn start(request: Request) -> bool {
    let first = Progress {
        agent: request.agent.clone(),
        build: request.name.clone(),
        step: "reading".into(),
        language: request.language.clone(),
        question: request.question.clone(),
        save_to: request.save_to.clone(),
        ..Default::default()
    };
    ANALYSIS.start(first, move || analyse(&request), |p| {
        // Kept beside its build, to be shown when the build is opened again
        if p.state == "done" && !p.save_to.is_empty() {
            if let Err(e) = save(Path::new(&p.save_to), p) {
                log::warn!("ai: keeping the report beside {}: {e}", p.save_to);
            }
        }
    })
}

/// Where the report of the build in `build` (`<name>.xml`) is kept: `<name>.ai.json` beside it.
pub fn saved_path(build: &Path) -> PathBuf {
    build.with_extension("ai.json")
}

/// The report kept beside the build in `build`, if one.
pub fn saved(build: &Path) -> Option<Progress> {
    serde_json::from_str(&std::fs::read_to_string(saved_path(build)).ok()?).ok()
}

/// Keeps `report` beside the build in `build`.
pub fn save(build: &Path, report: &Progress) -> Result<(), String> {
    let mut kept = report.clone();
    kept.save_to = build.display().to_string();
    kept.activity.clear();
    let json = serde_json::to_string_pretty(&kept).map_err(|e| e.to_string())?;
    std::fs::write(saved_path(build), json).map_err(|e| e.to_string())
}

/// Stops the analysis running, if one.
pub fn cancel() {
    ANALYSIS.cancel();
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
pub(crate) const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn analyse(req: &Request) -> Result<(Value, String), String> {
    let (name, xml) = read_build(req)?;
    if !name.is_empty() {
        ANALYSIS.update(|p| p.build = name.clone());
    }
    let digest = digest(&xml)?;
    let prompt = prompt(&digest, &req.language, &req.question);
    let text = run_agent(&ANALYSIS, &req.agent, &prompt, None)?;
    ANALYSIS.update(|p| p.step = "parsing".into());
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

/// The agent's answer, `prompt` on its stdin; its last message. With no `folder` it has no tools and starts somewhere
/// of its own; with one, it starts there and may read it, and only read.
pub fn run_agent(job: &'static Job, agent: &str, prompt: &str, folder: Option<&Path>) -> Result<String, String> {
    let program = find_program(agent).ok_or("noAgent")?;
    // Somewhere of its own: the agents read the folder they start in.
    let work = std::env::temp_dir().join("pobt-ai");
    let _ = std::fs::create_dir_all(&work);
    let tools = if folder.is_some() { "Read,Grep,Glob" } else { "" };
    let last = work.join(format!("last-{}.txt", std::process::id()));
    let _ = std::fs::remove_file(&last);
    let mut cmd = Command::new(&program);
    match agent {
        // Each streams its events as JSON lines, read as they come (`event`): what it does, and its answer.
        "claude" => {
            cmd.args(["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence", "--tools", tools]);
            if folder.is_some() {
                cmd.args(["--allowedTools", tools]);
            }
        }
        "codex" => {
            cmd.args(["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral", "--color", "never", "--json", "-o"]).arg(&last).arg("-");
        }
        _ => return Err("noAgent".into()),
    }
    cmd.current_dir(folder.unwrap_or(&work)).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    job.update(|p| p.step = "starting".into());
    let mut child = cmd.spawn().map_err(|e| format!("agentFailed: {}: {e}", program.display()))?;
    let mut stdin = child.stdin.take().ok_or("agentFailed: no stdin")?;
    let stdout = child.stdout.take().ok_or("agentFailed: no stdout")?;
    let stderr = child.stderr.take().ok_or("agentFailed: no stderr")?;
    let child = Arc::new(Mutex::new(child));
    *job.child.lock().unwrap() = Some(child.clone());
    let prompt = prompt.to_string();
    std::thread::spawn(move || {
        let _ = stdin.write_all(prompt.as_bytes());
    });
    job.update(|p| p.step = "waiting".into());
    let out = std::thread::spawn(move || read_stream(job, stdout));
    let err = std::thread::spawn(move || read_lines(stderr));
    let began = std::time::Instant::now();
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child.lock().unwrap().try_wait().map_err(|e| format!("agentFailed: {e}"))? {
            break status;
        }
        if !timed_out && began.elapsed() > TIMEOUT {
            timed_out = true;
            kill(&mut child.lock().unwrap());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    *job.child.lock().unwrap() = None;
    let out = out.join().unwrap_or_default();
    let err = err.join().unwrap_or_default();
    if job.cancelled() {
        return Err("cancelled".into());
    }
    if timed_out {
        return Err("timedOut".into());
    }
    let text = std::fs::read_to_string(&last).ok().filter(|t| !t.trim().is_empty()).unwrap_or(out.answer);
    let _ = std::fs::remove_file(&last);
    // What it said went wrong (not signed in, out of usage…)
    if let Some(e) = out.error.filter(|e| !e.trim().is_empty()) {
        return Err(format!("agentFailed: {e}"));
    }
    if !status.success() || text.trim().is_empty() {
        let why = if err.trim().is_empty() { &text } else { &err };
        let tail: String = why.trim().lines().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("agentFailed: {tail}"));
    }
    Ok(text)
}

/// How long an agent may take before it is stopped.
const TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// All of `r` (the agent's stderr).
fn read_lines(mut r: impl Read) -> String {
    let mut all = String::new();
    let _ = r.read_to_string(&mut all);
    all
}

/// What the agent's stream has said: its answer (whole, once it has come), the answer's pieces as they came, and the
/// error it reported, if any.
#[derive(Debug, Default)]
struct Stream {
    answer: String,
    pieces: String,
    error: Option<String>,
}

/// Reads the agent's JSON lines as they come, saying what it does (`step`, `activity`, `received`).
fn read_stream(job: &Job, r: impl Read) -> Stream {
    use std::io::BufRead;
    let mut s = Stream::default();
    for line in std::io::BufReader::new(r).lines().map_while(Result::ok) {
        if let Some(e) = event(&mut s, &line) {
            let received = s.answer.chars().count().max(s.pieces.chars().count());
            job.update(|p| {
                if !e.step.is_empty() {
                    p.step = e.step.into();
                }
                if !e.activity.is_empty() {
                    p.activity = e.activity;
                }
                p.received = received;
            });
        }
    }
    if s.answer.is_empty() {
        s.answer = std::mem::take(&mut s.pieces);
    }
    s
}

/// What a line of the stream says the agent does: its step, and the last of its words.
#[derive(Debug, Default, PartialEq)]
struct Event {
    step: &'static str,
    activity: String,
}

/// A line of Claude Code's `stream-json` (with partial messages) or of Codex's `--json` events; a line that is no
/// JSON is taken as the answer's text.
fn event(s: &mut Stream, line: &str) -> Option<Event> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        s.pieces.push_str(line);
        s.pieces.push('\n');
        return Some(Event { step: "writing", activity: tail(&s.pieces) });
    };
    let text_of = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    match v.get("type").and_then(Value::as_str).unwrap_or_default() {
        // Claude Code: its thinking and its answer in pieces, then the result
        "stream_event" => {
            let delta = v.pointer("/event/delta")?;
            match delta.get("type").and_then(Value::as_str)? {
                "text_delta" => {
                    s.pieces.push_str(&text_of(delta, "text"));
                    Some(Event { step: "writing", activity: tail(&s.pieces) })
                }
                "thinking_delta" => Some(Event { step: "thinking", activity: tail(&text_of(delta, "thinking")) }),
                _ => None,
            }
        }
        "result" => {
            let text = text_of(&v, "result");
            if v.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
                s.error = Some(if text.is_empty() { text_of(&v, "subtype") } else { text });
            } else {
                s.answer = text;
            }
            None
        }
        // Codex: its items as they start and end (its reasoning, its message), and its errors
        kind @ ("item.started" | "item.updated" | "item.completed") => {
            let item = v.get("item")?;
            let text = text_of(item, "text");
            match item.get("type").and_then(Value::as_str)? {
                "reasoning" => Some(Event { step: "thinking", activity: tail(&text) }),
                "agent_message" => {
                    if kind == "item.completed" {
                        s.answer = text.clone();
                    }
                    Some(Event { step: "writing", activity: tail(&text) })
                }
                _ => None,
            }
        }
        "error" => {
            s.error = Some(text_of(&v, "message"));
            None
        }
        "turn.failed" => {
            s.error = Some(v.pointer("/error/message").and_then(Value::as_str).unwrap_or("turn failed").to_string());
            None
        }
        _ => None,
    }
}

/// The last line of `text` with words in it: at most its last 160 characters.
fn tail(text: &str) -> String {
    let line = text.lines().rev().map(str::trim).find(|l| !l.is_empty()).unwrap_or_default();
    let n = line.chars().count();
    line.chars().skip(n.saturating_sub(160)).collect()
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
    fn reads_claude_codes_stream() {
        let mut s = Stream::default();
        assert_eq!(event(&mut s, r#"{"type":"system","subtype":"init"}"#), None);
        let e = event(&mut s, r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Looking at the defences"}}}"#).unwrap();
        assert_eq!((e.step, e.activity.as_str()), ("thinking", "Looking at the defences"));
        event(&mut s, r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"{\"title\":"}}}"#);
        let e = event(&mut s, r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" \"Fireball\""}}}"#).unwrap();
        assert_eq!((e.step, e.activity.as_str()), ("writing", r#"{"title": "Fireball""#));
        event(&mut s, r#"{"type":"result","subtype":"success","is_error":false,"result":"{\"dimensions\":[]}"}"#);
        assert_eq!(s.answer, r#"{"dimensions":[]}"#);
        assert_eq!(s.error, None);
        // Not signed in: the result says so
        let mut s = Stream::default();
        event(&mut s, r#"{"type":"result","subtype":"success","is_error":true,"result":"Invalid API key · Please run /login"}"#);
        assert_eq!(s.error.as_deref(), Some("Invalid API key · Please run /login"));
    }

    #[test]
    fn reads_codexs_events() {
        let mut s = Stream::default();
        assert_eq!(event(&mut s, r#"{"type":"thread.started","thread_id":"x"}"#), None);
        let e = event(&mut s, r#"{"type":"item.completed","item":{"id":"0","type":"reasoning","text":"**Weighing the resistances**"}}"#).unwrap();
        assert_eq!(e.step, "thinking");
        event(&mut s, r#"{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"{\"dimensions\":[]}"}}"#);
        assert_eq!(s.answer, r#"{"dimensions":[]}"#);
        let mut s = Stream::default();
        event(&mut s, r#"{"type":"turn.failed","error":{"message":"You've hit your usage limit"}}"#);
        assert_eq!(s.error.as_deref(), Some("You've hit your usage limit"));
    }

    #[test]
    fn keeps_a_report_beside_its_build() {
        let dir = std::env::temp_dir().join(format!("pobt-ai-saved-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let build = dir.join("Fireball Witch.xml");
        assert_eq!(saved_path(&build), dir.join("Fireball Witch.ai.json"));
        assert!(saved(&build).is_none());
        let p = Progress {
            state: "done".into(),
            agent: "claude".into(),
            activity: "…".into(),
            finished: 42,
            report: serde_json::json!({ "score": 70, "dimensions": [] }),
            ..Default::default()
        };
        save(&build, &p).unwrap();
        let back = saved(&build).unwrap();
        assert_eq!((back.state.as_str(), back.finished, back.report["score"].as_i64()), ("done", 42, Some(70)));
        assert_eq!(back.save_to, build.display().to_string());
        assert!(back.activity.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
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
