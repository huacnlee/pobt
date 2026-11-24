// The AI analysis as both its pages show it, the launcher's (Tools → AI build analysis) and the build editor's tab:
// the analysis running (its stages, time, what the agent streams), its error, and its report.
import { type JSX, Scroll, signal, Text, View, type ViewStyle } from "nsh";
import { Pob } from "pobt/native";
import { type AiProgress, AI_STEPS, aiErrorText, type AnalysisStrings, DIMENSIONS, type Dimension, type Report } from "./analysis";
import { BODY, C, DISPLAY } from "./ui/launcher";

export const PANEL: ViewStyle = {
  backgroundColor: "rgba(5,6,9,0.86)",
  borderWidth: 1,
  borderColor: C.trim,
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.8), 0 10px 30px rgba(0,0,0,0.6)",
  padding: 20,
  gap: 14,
};

/** A small framed button, as the update badge: a character's actions, an account's. */
export function SmallButton(props: { label: string; onPress: () => void; disabled?: boolean; accent?: boolean }) {
  const hover = signal(false);
  const lit = () => hover() && !props.disabled;
  return (
    <View
      role="button"
      onPress={() => !props.disabled && props.onPress()}
      onMouseEnter={() => hover.set(true)}
      onMouseLeave={() => hover.set(false)}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: lit() ? C.trimHi : C.trim,
        backgroundColor: props.accent ? "rgba(142,34,24,0.55)" : "rgba(0,0,0,0.55)",
        opacity: props.disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontFamily: BODY, fontSize: 12, color: lit() ? "#fff3d0" : C.gold }}>{props.label}</Text>
    </View>
  );
}

/** A score's colour: green when good, gold when fair, red when poor (`of` the most it can be). */
function scoreColor(score: number, of: number): string {
  const r = score / of;
  return r >= 0.7 ? "#8fc46a" : r >= 0.45 ? C.gold : C.red;
}

/** A score out of `of`, as a bar filling its groove. */
function ScoreBar(props: { score: number; of: number; width: number }) {
  return (
    <View style={{ width: props.width, height: 6, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(107,82,44,0.6)" }}>
      <View style={{ width: (props.width - 2) * Math.max(0, Math.min(props.score / props.of, 1)), height: 4, backgroundColor: scoreColor(props.score, props.of) }} />
    </View>
  );
}

/** One list of a dimension (strengths, weaknesses, suggestions), each item after `mark` in `color`. */
function Points(props: { label: string; items?: string[]; mark: string; color: string }) {
  return (
    <If when={props.items?.length}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: BODY, fontSize: 11, fontWeight: "700", color: C.muted }}>{props.label}</Text>
        <Each of={props.items ?? []}>
          {(item) => (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Text style={{ fontFamily: BODY, fontSize: 12, fontWeight: "700", color: props.color, lineHeight: 18 }}>{props.mark}</Text>
              <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: C.text, lineHeight: 18 }}>{item()}</Text>
            </View>
          )}
        </Each>
      </View>
    </If>
  );
}

/** A dimension of the report, as a card: its name and score, its verdict, its numbers, and its lists. */
function DimensionCard(props: { s: AnalysisStrings; d: Dimension }) {
  return (
    <View style={{ ...PANEL, padding: 16, gap: 10, width: "48.5%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ flex: 1, fontFamily: DISPLAY, fontSize: 15, fontWeight: "700", letterSpacing: 1, color: C.goldHi }}>{props.s.dimensions[props.d.key] ?? props.d.key}</Text>
        <ScoreBar score={props.d.score} of={10} width={90} />
        <Text style={{ fontFamily: BODY, fontSize: 15, fontWeight: "700", color: scoreColor(props.d.score, 10) }}>{props.d.score}</Text>
        <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim }}>/10</Text>
      </View>
      <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 20 }}>{props.d.verdict}</Text>
      <If when={props.d.metrics?.length}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Each of={props.d.metrics ?? []}>
            {(m) => (
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(107,82,44,0.6)", backgroundColor: "rgba(0,0,0,0.5)", gap: 1 }}>
                <Text style={{ fontFamily: BODY, fontSize: 10, color: C.muted }}>{m().label}</Text>
                <Text style={{ fontFamily: BODY, fontSize: 13, fontWeight: "700", color: C.goldHi }}>{m().value}</Text>
              </View>
            )}
          </Each>
        </View>
      </If>
      <Points label={props.s.strengths} items={props.d.strengths} mark="+" color="#8fc46a" />
      <Points label={props.s.weaknesses} items={props.d.weaknesses} mark="−" color={C.red} />
      <Points label={props.s.suggestions} items={props.d.suggestions} mark="›" color={C.unique} />
    </View>
  );
}

/** The analysis running: each stage (done, the one now, those to come), the time it has taken, how much of the
 * answer has come, the last of what the agent streams, and Stop. */
export function AnalysisRunning(props: { s: AnalysisStrings; job: AiProgress; seconds: number; agentName?: string; onStop: () => void }) {
  const now = () => Math.max(0, AI_STEPS.indexOf(props.job.step));
  return (
    <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
      <Text style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: "700", color: C.goldHi }}>{props.s.steps[props.job.step] ?? "…"}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Each of={AI_STEPS}>
          {(step, i) => (
            <View
              accessibilityLabel={props.s.steps[step()]}
              style={{
                width: i() === now() ? 22 : 8,
                height: 8,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: i() <= now() ? C.goldHi : C.trim,
                backgroundColor: i() < now() ? C.gold : i() === now() ? "rgba(220,199,146,0.45)" : "transparent",
                transitionProperty: "width",
                transitionDuration: 200,
              }}
            />
          )}
        </Each>
      </View>
      <Text style={{ fontFamily: BODY, fontSize: 13, color: C.muted }}>
        {[props.job.build, props.agentName, props.s.elapsed(props.seconds), props.job.received > 0 ? props.s.received(props.job.received) : ""]
          .filter(Boolean)
          .join("  ·  ")}
      </Text>
      <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim, maxWidth: 560, numberOfLines: 2, textAlign: "center" }}>{props.job.activity}</Text>
      <SmallButton label={props.s.stop} onPress={props.onStop} />
    </View>
  );
}

/** An analysis that failed or was stopped: why, in the user's words, and what can be done (`actions`). */
export function AnalysisFailed(props: { s: AnalysisStrings; job: AiProgress; actions?: JSX.Element }) {
  const cancelled = () => props.job.state === "cancelled";
  return (
    <View style={{ ...PANEL, flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Text style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: "700", color: cancelled() ? C.gold : C.red }}>
        {cancelled() ? props.s.cancelled : props.s.failedTitle}
      </Text>
      <If when={!cancelled()}>
        <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, maxWidth: 560, textAlign: "center", lineHeight: 20 }}>{aiErrorText(props.s, props.job.error)}</Text>
      </If>
      {props.actions}
    </View>
  );
}

/** The report (overall, then each dimension two by two), or the agent's answer as it came when it was no report.
 * `meta`: the build and who made it when; `actions`: buttons beside Copy. */
export function AnalysisReport(props: { s: AnalysisStrings; job: AiProgress; meta: string; onCopy: () => void; actions?: JSX.Element }) {
  const report = (): Report | null => (props.job.state === "done" ? props.job.report : null);
  // The dimensions in their order, whatever the agent's.
  const dimensions = () => [...(report()?.dimensions ?? [])].sort((a, b) => DIMENSIONS.indexOf(a.key) - DIMENSIONS.indexOf(b.key));
  return (
    <If
      when={report()}
      else={
        <View style={{ ...PANEL, flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: C.unique }}>{props.s.unparsed}</Text>
            {props.actions}
            <SmallButton label={props.s.copy} onPress={props.onCopy} />
          </View>
          <Scroll style={{ flex: 1 }}>
            <Text style={{ fontFamily: BODY, fontSize: 12, color: C.text, lineHeight: 19 }}>{props.job.raw}</Text>
          </Scroll>
        </View>
      }
    >
      {(r) => (
        <Scroll style={{ flex: 1 }}>
          <View style={{ gap: 14, paddingBottom: 4 }}>
            {/* Overall: the build, its score, the verdict and what to do first */}
            <View style={{ ...PANEL, flexDirection: "row", gap: 20 }}>
              <View style={{ width: 120, alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Text style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: "700", color: scoreColor(r().score ?? 0, 100), textShadow: "0 2px 8px #000" }}>{r().score ?? "–"}</Text>
                <ScoreBar score={r().score ?? 0} of={100} width={100} />
                <Text style={{ fontFamily: BODY, fontSize: 11, color: C.muted }}>{props.s.overall}</Text>
              </View>
              <View style={{ flex: 1, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ flex: 1, fontFamily: DISPLAY, fontSize: 18, fontWeight: "700", color: C.goldHi, numberOfLines: 1 }}>{r().title ?? props.job.build}</Text>
                  <Text style={{ fontFamily: BODY, fontSize: 11, color: C.dim }}>{props.meta}</Text>
                  {props.actions}
                  <SmallButton label={props.s.copy} onPress={props.onCopy} />
                </View>
                <Text style={{ fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 21 }}>{r().summary ?? ""}</Text>
                <If when={r().priorities?.length}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: BODY, fontSize: 11, fontWeight: "700", color: C.muted }}>{props.s.priorities}</Text>
                    <Each of={r().priorities ?? []}>
                      {(p, i) => (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Text style={{ fontFamily: BODY, fontSize: 12, fontWeight: "700", color: C.unique, lineHeight: 18 }}>{i() + 1}.</Text>
                          <Text style={{ flex: 1, fontFamily: BODY, fontSize: 12, color: C.text, lineHeight: 18 }}>{p()}</Text>
                        </View>
                      )}
                    </Each>
                  </View>
                </If>
              </View>
            </View>
            {/* Each dimension, two by two */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 }}>
              <Each of={dimensions()}>{(d) => <DimensionCard s={props.s} d={d()} />}</Each>
            </View>
          </View>
        </Scroll>
      )}
    </If>
  );
}

/** Polls the analysis while it runs: `onTick` hears it, and the seconds since it began, every quarter second and
 * once more when it ends. */
export function watchAnalysis(onTick: (job: AiProgress | null, seconds: number) => void) {
  const began = Date.now();
  const tick = () => {
    const json = Pob.aiProgress();
    const job: AiProgress | null = json ? JSON.parse(json) : null;
    onTick(job, Math.floor((Date.now() - began) / 1000));
    if (job?.state === "running") setTimeout(tick, 250);
  };
  tick();
}
