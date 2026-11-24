import type { JSX } from "nsh";
import { View } from "nsh";
import { Dialog } from "nsh/base";
import { Text } from "./text";

/** A dialog over the window: a title, its content, then its actions at the end. Escape and a press outside close it. */
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  actions?: JSX.Element;
  class?: string;
  children?: JSX.Element;
}) {
  return (
    <Dialog
      open={props.open}
      animation="fade"
      accessibilityLabel={props.title}
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      backdropClass="bg-overlay"
      class={`m-auto max-h-[85%] gap-3 rounded-(--radius) border border-border bg-popover p-4 shadow-lg ${props.class ?? "w-[560px]"}`}
    >
      <Text variant="title">{props.title}</Text>
      {props.children}
      <If when={props.actions}>
        <View class="flex-row items-center justify-end gap-2">{props.actions}</View>
      </If>
    </Dialog>
  );
}
