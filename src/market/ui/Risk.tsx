// The risk of a trade, said in words and color: every opportunity carries one.
import { t } from "../data/i18n";
import { Badge } from "../../ui";

export type RiskLevel = "low" | "medium" | "high";

const TONE = { low: "neutral", medium: "warning", high: "destructive" } as const;

export function RiskBadge(props: { risk: RiskLevel }) {
  return <Badge label={t(`risk.${props.risk}`)} tone={TONE[props.risk]} icon={props.risk === "low" ? "shield" : "triangle-alert"} />;
}

/** Where a trade is made, in words. */
export const where = (w: "exchange" | "trade") => t(`where.${w}`);
