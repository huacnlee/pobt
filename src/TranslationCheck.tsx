// The translation check over the build editor (Tools → AI translation check): the open build's lines the dictionary
// has no translation for, an AI's translations of them (kept at once in trs/<language>/POBT-ai.csv, which the screens
// read again by themselves), and, with GitHub's gh signed in, a pull request of them to POBT.
import { Pob } from "pobt/native";
import { Scroll, signal, Text, View } from "nsh";
import { type Agent, analysisStrings } from "./analysis";
import { AnalysisRunning, PANEL, SmallButton } from "./AnalysisView";
import { language } from "./editor/i18n";
import { build } from "./editor/session";
import { BODY, BrassButton as Button, C, DISPLAY, GoldRule as Rule } from "./ui/launcher";
import { buildTexts, fillErrorText, type FillProgress, plainText, trCheckStrings } from "./trcheck";

export function TranslationCheck(props: { onBack: () => void }) {
  const s = () => trCheckStrings(language());
  const agents = signal<Agent[]>(JSON.parse(Pob.aiAgents() || "[]"));
  const agent = signal<string>(agents()[0]?.id ?? "");
  const name = () => build.sidebar()?.summary.name ?? "";
  // The build's lines with no translation, without their colours; null while they are read.
  const missing = signal<string[] | null>(null);
  const job = signal<FillProgress | null>(null);
  const seconds = signal(0);
  const gh = signal(false);
  const offer = signal<{ state: "idle" | "busy" | "done" | "failed"; text: string }>({ state: "idle", text: "" });

  const scan = async () => {
    missing.set(null);
    const texts = await buildTexts().catch(() => [] as string[]);
    const lines = (JSON.parse(Pob.trMissing(JSON.stringify(texts))) as string[]).map(plainText);
    missing.set([...new Set(lines)].filter(Boolean));
  };

  const watch = () => {
    const began = Date.now();
    const tick = () => {
      const json = Pob.trFillProgress();
      const now: FillProgress | null = json ? JSON.parse(json) : null;
      job.set(now);
      seconds.set(Math.floor((Date.now() - began) / 1000));
      if (now?.state === "running") setTimeout(tick, 250);
      // its rows read again by the screens (a second or so), what is left
      else if (now?.state === "done" && now.report?.kept) setTimeout(() => void scan(), 1500);
    };
    tick();
  };

  const fill = () => {
    const lines = missing();
    if (!lines?.length || !agent()) return;
    offer.set({ state: "idle", text: "" });
    if (Pob.trFillStart(JSON.stringify({ agent: agent(), language: language() ?? "", build: name(), lines }))) watch();
  };

  const submit = async () => {
    const j = job();
    if (!j?.report) return;
    offer.set({ state: "busy", text: s().submitting });
    const out = JSON.parse(await Pob.trSubmit(JSON.stringify({ agent: j.agent, language: j.language, build: j.build, rows: j.report.rows }))) as {
      url?: string;
      error?: string;
    };
    offer.set(out.url ? { state: "done", text: out.url } : { state: "failed", text: out.error ?? "" });
  };

  void scan();
  void Pob.trGhReady().then(gh.set);
  // a translation still running (the panel was closed meanwhile), or the last one
  if (Pob.trFillProgress()) watch();

  const running = () => job()?.state === "running";
  const agentName = (id: string) => agents().find((a) => a.id === id)?.name ?? id;

  return (
    <View style={{ flex: 1, flexDirection: "row", gap: 20, paddingHorizontal: 32, paddingTop: 16, paddingBottom: 24, backgroundColor: C.bg }}>
      {/* The build's lines with no translation, and the AI to translate them */}
      <View style={{ ...PANEL, width: 400 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", letterSpacing: 3, color: C.goldHi }}>{s().title}</Text>
          <SmallButton label={s().back} onPress={props.onBack} />
        </View>
        <Rule width={360} />
        <Text style={{ fontFamily: BODY, fontSize: 13, color: C.unique, numberOfLines: 1 }}>{name()}</Text>
        <If when={missing()} else={<Text style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>{s().scanning}</Text>}>
          {(lines) => (
            <>
              <Text style={{ fontFamily: BODY, fontSize: 13, color: lines().length ? C.text : "#8fc46a" }}>
                {lines().length ? s().missing(lines().length) : s().none}
              </Text>
              <View style={{ flex: 1, minHeight: 120, borderWidth: 1, borderColor: C.trim, backgroundColor: "rgba(0,0,0,0.5)" }}>
                <Scroll style={{ flex: 1 }}>
                  <View style={{ padding: 8, gap: 4 }}>
                    <Each of={lines()}>{(line) => <Text style={{ fontFamily: BODY, fontSize: 12, color: C.text }}>{line()}</Text>}</Each>
                  </View>
                </Scroll>
              </View>
            </>
          )}
        </If>
        <If when={agents().length > 0} else={<Text style={{ fontFamily: BODY, fontSize: 12, color: C.dim }}>{s().noAgent}</Text>}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.gold }}>{s().agent}</Text>
            <Each of={agents()}>{(a) => <SmallButton label={a().name} accent={agent() === a().id} onPress={() => agent.set(a().id)} />}</Each>
          </View>
        </If>
        <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim, lineHeight: 17 }}>{s().hint}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
          <SmallButton label={s().rescan} disabled={running() || missing() === null} onPress={() => void scan()} />
          <If when={!running() && (missing()?.length ?? 0) > 0 && agents().length > 0}>
            <Button label={s().fill} onPress={fill} />
          </If>
        </View>
      </View>

      {/* The translation running, how it ended, or its rows */}
      <View style={{ flex: 1 }}>
        <If when={running() ? job() : null}>
          {(j) => (
            <AnalysisRunning s={analysisStrings(language())} job={{ ...j(), report: null }} seconds={seconds()} agentName={agentName(j().agent)} onStop={() => Pob.trFillCancel()} />
          )}
        </If>
        <If when={!job()}>
          <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: BODY, fontSize: 13, color: C.dim }}>{s().empty}</Text>
          </View>
        </If>
        <If when={job()?.state === "failed" || job()?.state === "cancelled" ? job() : null}>
          {(j) => (
            <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: "700", color: C.red }}>{s().failed}</Text>
              <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, maxWidth: 560, textAlign: "center", lineHeight: 20 }}>
                {fillErrorText(s(), j().state === "cancelled" ? "cancelled" : j().error)}
              </Text>
            </View>
          )}
        </If>
        <If when={job()?.state === "done" ? job()?.report : null}>
          {(report) => (
            <View style={{ ...PANEL, flex: 1 }}>
              <Text style={{ fontFamily: BODY, fontSize: 13, color: "#8fc46a" }}>{s().kept(report().kept, report().file)}</Text>
              <Scroll style={{ flex: 1 }}>
                <View style={{ gap: 6 }}>
                  <Each of={report().rows}>
                    {(row) => (
                      <View style={{ flexDirection: "row", gap: 12, paddingVertical: 4, borderBottomWidth: 1, borderColor: "rgba(120,100,60,0.25)" }}>
                        <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: C.muted }}>{row().en}</Text>
                        <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: row().why ? C.dim : C.text }}>{row().zh}</Text>
                        <Text style={{ width: 150, fontFamily: BODY, fontSize: 11, color: row().why ? C.red : "#8fc46a" }}>{s().why[row().why]}</Text>
                      </View>
                    )}
                  </Each>
                </View>
              </Scroll>
              <If when={report().kept > 0}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <If when={gh()} else={<Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: C.dim }}>{s().noGh}</Text>}>
                    <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: offer().state === "failed" ? C.red : C.muted, numberOfLines: 2 }}>
                      {offer().state === "done" ? `${s().submitted}: ${offer().text}` : offer().text}
                    </Text>
                    <If when={offer().state === "done"} else={<Button label={s().submit} onPress={() => offer().state !== "busy" && void submit()} />}>
                      <SmallButton label={s().submitted} accent onPress={() => Pob.openUrl(offer().text)} />
                    </If>
                  </If>
                </View>
              </If>
            </View>
          )}
        </If>
      </View>
    </View>
  );
}
