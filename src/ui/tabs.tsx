// One of a few sections or modes: nsh/base's Tabs, whose indicator travels to the
// selected tab natively (a spring; at once with reduced motion). The caller keeps which is selected.
import { Text } from "nsh";
import { Tab, Tabs as BaseTabs } from "nsh/base";
import { WASH } from "./motion";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Its test id (the app's sections: `nav-…`). */
  testID?: string;
}

/** A segmented choice among a few values: a framed strip, a raised pill sliding to the chosen one. */
/** `class` places it in its parent (default `self-start`: in a column it keeps its own width). */
export function Segmented<T extends string>(props: { items: TabItem<T>[]; value: T; onChange: (value: T) => void; label: string; class?: string }) {
  return (
    <BaseTabs
      orientation="horizontal"
      accessibilityLabel={props.label}
      class={`h-7 flex-row rounded-(--radius) border border-border bg-muted p-0.5 ${props.class ?? "self-start"}`}
      indicatorClass="inset-y-0.5 rounded-(--radius) border border-border bg-background"
    >
      <Each of={props.items} key={(i: TabItem<T>) => i.value}>
        {(item: () => TabItem<T>) => (
          <Tab
            selected={props.value === item().value}
            onPress={() => props.onChange(item().value)}
            testID={item().testID}
            class="justify-center rounded-(--radius) px-2.5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Text
              class={`text-xs ${WASH}`}
              classList={{ "font-medium text-foreground": props.value === item().value, "text-muted-foreground": props.value !== item().value }}
            >
              {item().label}
            </Text>
          </Tab>
        )}
      </Each>
    </BaseTabs>
  );
}

/** A row of tabs, an underline sliding to the selected one; `class` adds the row's frame (its height, a rule under it). */
export function Tabs<T extends string>(props: { items: TabItem<T>[]; value: T; onChange: (value: T) => void; label: string; class?: string }) {
  return (
    <BaseTabs
      orientation="horizontal"
      accessibilityLabel={props.label}
      class={`flex-row items-stretch gap-1 ${props.class ?? "h-9 border-b border-border"}`}
      indicatorClass="bottom-0 mx-2 h-0.5 rounded-full bg-primary"
    >
      <Each of={props.items} key={(i: TabItem<T>) => i.value}>
        {(item: () => TabItem<T>) => (
          <Tab
            selected={props.value === item().value}
            onPress={() => props.onChange(item().value)}
            testID={item().testID}
            class={`justify-center rounded-t-(--radius) px-3 ${WASH} hover:bg-accent/60 focus-visible:bg-accent`}
          >
            <Text
              class={`text-sm ${WASH}`}
              classList={{ "font-semibold text-foreground": props.value === item().value, "text-muted-foreground": props.value !== item().value }}
            >
              {item().label}
            </Text>
          </Tab>
        )}
      </Each>
    </BaseTabs>
  );
}
