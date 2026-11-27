// Where the app is: a section of the sidebar, and the pages opened from it (an opportunity, an item).
import { createNavStack } from "nsh/base";
import { type IconName } from "../ui";

export type Section = "opportunities" | "market" | "search" | "watchlist" | "ledger" | "filter" | "settings";

export type Route =
  | { page: Section }
  | { page: "opportunity"; id: string }
  | { page: "item"; id: string; name: string };

export const SECTIONS: { value: Section; label: string; icon: IconName }[] = [
  { value: "opportunities", label: "nav.opportunities", icon: "sparkles" },
  { value: "market", label: "nav.market", icon: "chart-candlestick" },
  { value: "search", label: "nav.search", icon: "search" },
  { value: "watchlist", label: "nav.watchlist", icon: "star" },
  { value: "ledger", label: "nav.ledger", icon: "wallet" },
  { value: "filter", label: "nav.filter", icon: "filter" },
  { value: "settings", label: "nav.settings", icon: "settings" },
];

export const stack = createNavStack<Route>([{ page: "opportunities" }]);

export function section(): Section {
  return stack.routes()[0].page as Section;
}

export function go(to: Section) {
  stack.setRoutes([{ page: to }]);
}

export function openItem(id: string, name: string) {
  stack.push({ page: "item", id, name });
}

export function openOpportunity(id: string) {
  stack.push({ page: "opportunity", id });
}

