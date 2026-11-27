// A menu of actions under a trigger, on nsh/base's Menu: the popover box, growing from the trigger.
import { type JSX, Text } from "nsh";
import { Menu as BaseMenu, MenuItem as BaseMenuItem } from "nsh/base";
import { Icon, type IconName } from "./icon";
import { popup, popupEnding, popupStarting, WASH } from "./motion";

export function Menu(props: { trigger: JSX.Element; children: JSX.Element; align?: "start" | "end" }) {
  return (
    <BaseMenu
      trigger={props.trigger}
      placement="bottom"
      align={props.align ?? "end"}
      offset={6}
      popupClass={popup}
      popupStartingClass={popupStarting}
      popupEndingClass={popupEnding}
    >
      {props.children}
    </BaseMenu>
  );
}

export function MenuItem(props: { label: string; icon?: IconName; onSelect: () => void; destructive?: boolean }) {
  return (
    <BaseMenuItem
      onSelect={props.onSelect}
      accessibilityLabel={props.label}
      class={`flex-row items-center gap-2 rounded-sm px-2 py-1 ${WASH} hover:bg-accent focus:bg-accent`}
    >
      <If when={props.icon}>{(name) => <Icon name={name()} size="sm" tone={props.destructive ? "destructive" : "muted"} />}</If>
      <Text class={`text-sm ${props.destructive ? "text-destructive" : "text-popover-foreground"}`}>{props.label}</Text>
    </BaseMenuItem>
  );
}
