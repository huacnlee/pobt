// The AI analysis tab of POBT's build editor: the open build, as it is now, analysed by the AI on the user's machine
// (Claude Code or Codex, ai.rs), as the launcher's Tools → AI build analysis does it. The report is kept beside the
// build's file (`<name>.ai.json`), shown again whenever the build is opened, until it is analysed again.
import { Clipboard, effect, signal, untracked, View } from "nsh";
import { Pob } from "pobt/native";
import { type Agent, AGENT_SITES, type AiProgress, analysisStrings, reportText, whenText } from "../../analysis";
import { AnalysisFailed, AnalysisReport, AnalysisRunning, PANEL, watchAnalysis } from "../../AnalysisView";
import { Button, Segmented, Text, Input } from "../../ui";
import { BODY, C } from "../../ui/launcher";
import { language } from "../i18n";
import { build, exportCode } from "../session";

export function AnalysisPage() {
  const s = () => analysisStrings(language());
  const agents = signal<Agent[]>(JSON.parse(Pob.aiAgents() || "[]"));
  const agent = signal(agents()[0]?.id ?? "");
  const question = signal("");
  const seconds = signal(0);
  // The analysis running (one at a time, this tab's or the launcher's), and how this tab's last one ended
  const live = signal<AiProgress | null>(null);
  const ended = signal<AiProgress | null>(null);
  const copied = signal(false);
  let mine = false;
  const running = () => live()?.state === "running";
  const path = () => build.sidebar()?.summary.path ?? null;

  // This build's report: kept beside its file, or (a build with no file yet) the one made since it was opened
  const kept = signal<AiProgress | null>(null);
  effect(() => {
    const p = path();
    const pending = build.aiReport();
    untracked(() => {
      const json = p ? Pob.aiSaved(p) : "";
      kept.set(json ? JSON.parse(json) : pending);
      ended.set(null);
    });
  });

  const watch = () =>
    watchAnalysis((p, secs) => {
      live.set(p);
      seconds.set(secs);
      if (!p || p.state === "running") return;
      // This build's, wherever it was asked for: kept beside its file
      if (p.state === "done" && p.save_to && p.save_to === path()) kept.set(p);
      if (!mine) return;
      mine = false;
      if (p.state !== "done") ended.set(p);
      else if (!p.save_to) build.aiReport.set(p);
    });
  // One running (from the launcher, or before the tab was left): shown, and watched on
  if (Pob.aiProgress() && JSON.parse(Pob.aiProgress()).state === "running") watch();

  const analyse = async () => {
    if (running() || !agent()) return;
    ended.set(null);
    // The build as it is now, changes not saved included: its code, as Copy build code gives it
    const code = await exportCode();
    const sent = Pob.aiStart(
      JSON.stringify({ agent: agent(), code, name: build.sidebar()?.summary.name ?? "", language: s().answerIn, question: question().trim(), save_to: path() ?? "" }),
    );
    if (sent) {
      mine = true;
      watch();
    }
  };
  const agentName = (id: string) => agents().find((a) => a.id === id)?.name ?? id;
  const copy = async () => {
    const k = kept();
    if (!k) return;
    await Clipboard.writeText(k.report ? reportText(s(), k.report) : k.raw);
    copied.set(true);
    setTimeout(() => copied.set(false), 1500);
  };
  const lookAgain = () => {
    agents.set(JSON.parse(Pob.aiAgents() || "[]"));
    if (!agents().some((a) => a.id === agent())) agent.set(agents()[0]?.id ?? "");
  };

  return (
    <View class="flex-1">
      {/* Which AI, the user's question, and Analyse (again) */}
      <View class="h-12 flex-row items-center gap-3 border-b border-border px-4">
        <If
          when={agents().length > 0}
          else={
            <View class="flex-1 flex-row items-center gap-2">
              <Text tone="warning">{s().noAgent.title}</Text>
              <Button size="sm" label={s().noAgent.claude} onPress={() => Pob.openUrl(AGENT_SITES.claude)} />
              <Button size="sm" label={s().noAgent.codex} onPress={() => Pob.openUrl(AGENT_SITES.codex)} />
              <Button size="sm" variant="ghost" label={s().noAgent.refresh} onPress={lookAgain} />
            </View>
          }
        >
          <Text tone="muted">{s().agent}</Text>
          <Segmented items={agents().map((a) => ({ value: a.id, label: a.name }))} value={agent()} onChange={(k) => agent.set(k)} label={s().agent} />
          <Input value={question()} onChange={(v) => question.set(v)} onSubmit={() => void analyse()} placeholder={s().questionHint} accessibilityLabel={s().question} class="flex-1" />
          <Button variant="primary" label={kept() ? s().again : s().analyse} disabled={running()} onPress={() => void analyse()} />
        </If>
      </View>
      <View class="flex-1 p-4">
        <If when={running() ? live() : null}>
          {(j) => <AnalysisRunning s={s()} job={j()} seconds={seconds()} agentName={agentName(j().agent)} onStop={() => Pob.aiCancel()} />}
        </If>
        <If when={running() ? null : ended()}>{(j) => <AnalysisFailed s={s()} job={j()} />}</If>
        <If when={running() || ended() ? null : kept()}>
          {(k) => (
            <AnalysisReport
              s={s()}
              job={k()}
              meta={s().madeBy(agentName(k().agent), whenText(k().finished))}
              onCopy={() => void copy()}
              actions={copied() ? <Text style={{ fontFamily: BODY, fontSize: 11, color: C.gold }}>{s().copied}</Text> : undefined}
            />
          )}
        </If>
        <If when={!running() && !ended() && !kept()}>
          <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: BODY, fontSize: 13, color: C.dim, maxWidth: 420, textAlign: "center", lineHeight: 20 }}>{s().emptyEditor}</Text>
          </View>
        </If>
      </View>
    </View>
  );
}
