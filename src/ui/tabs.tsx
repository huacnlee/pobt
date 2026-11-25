import { Text } from "nsh";
import { Tab, Tabs } from "nsh/base";
import { WASH } from "./motion";

export type TabItem<K extends string> = { key: K; label: string };

/** A row of tabs with one underline sliding to the selected one (the indicator moves natively, at once with reduced
 * motion). The caller keeps which is selected and shows its content. */
export function TabBar<K extends string>(props: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel: string;
  class?: string;
}) {
  return (
    <Tabs
      orientation="horizontal"
      accessibilityLabel={props.accessibilityLabel}
      class={`flex-row items-stretch gap-1 ${props.class ?? ""}`}
      indicatorClass="bottom-0 h-0.5 mx-2 rounded-full bg-primary"
    >
      <Each of={props.items} key={(t) => t.key}>
        {(tab) => (
          <Tab
            selected={props.value === tab().key}
            onPress={() => props.onChange(tab().key)}
            class={`justify-center rounded-t-(--radius) px-3 ${WASH} hover:bg-accent/60 focus-visible:bg-accent`}
          >
            <Text
              class={`text-sm ${WASH}`}
              classList={{ "text-foreground font-semibold": props.value === tab().key, "text-muted-foreground": props.value !== tab().key }}
            >
              {tab().label}
            </Text>
          </Tab>
        )}
      </Each>
    </Tabs>
  );
}

/** A segmented choice among a few values, its selection sliding as the tab bar's does. */
export function Segmented<K extends string>(props: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel: string;
}) {
  return (
    <Tabs
      orientation="horizontal"
      accessibilityLabel={props.accessibilityLabel}
      class="h-7 flex-row rounded-(--radius) border border-border bg-muted p-0.5"
      indicatorClass="inset-y-0.5 rounded-(--radius) bg-background border border-border"
    >
      <Each of={props.items} key={(t) => t.key}>
        {(tab) => (
          <Tab selected={props.value === tab().key} onPress={() => props.onChange(tab().key)} class="justify-center px-2.5">
            <Text class={`text-xs ${WASH}`} classList={{ "text-foreground font-medium": props.value === tab().key, "text-muted-foreground": props.value !== tab().key }}>
              {tab().label}
            </Text>
          </Tab>
        )}
      </Each>
    </Tabs>
  );
}
