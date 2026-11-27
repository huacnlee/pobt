// Cards that open under their header, on nsh/base's Accordion: the header washes on hover like a Row, its chevron
// turns as the card opens, and the body springs open (`reveal`; at once with reduced motion).
import { type JSX, View } from "nsh";
import { Accordion as BaseAccordion, AccordionHeader, AccordionItem as BaseItem, AccordionPanel, AccordionTrigger } from "nsh/base";
import { Icon } from "./icon";
import { WASH } from "./motion";

/** The open items are the app's: `value` holds their ids, `onChange` the next ones. Several may be open. */
export function Accordion(props: { value: string[]; onChange: (value: string[]) => void; children: JSX.Element; class?: string }) {
  return (
    <BaseAccordion multiple value={props.value} onChange={(e) => props.onChange(e.value)} class={`gap-2 ${props.class ?? ""}`}>
      {props.children}
    </BaseAccordion>
  );
}

/** One card: `header` is its summary row (the chevron is added at its end), `children` what opens under it. */
export function AccordionItem(props: { value: string; header: JSX.Element; label?: string; children: JSX.Element; testID?: string }) {
  return (
    <BaseItem value={props.value} class="overflow-hidden rounded-(--radius) border border-border bg-card">
      <AccordionHeader>
        <AccordionTrigger
          accessibilityLabel={props.label}
          testID={props.testID}
          class={`group flex-row items-center gap-3 px-4 py-3 ${WASH} hover:bg-accent/60 active:bg-accent focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {props.header}
          <View class="transition-transform duration-180 ease-out motion-reduce:transition-none group-aria-expanded:rotate-180">
            <Icon name="chevron-down" size="sm" tone="muted" />
          </View>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel reveal accessibilityLabel={props.label}>
        <View class="border-t border-border">{props.children}</View>
      </AccordionPanel>
    </BaseItem>
  );
}
