// What a view shows when it has nothing, is loading, or failed. Empty: a title in the display face, a muted line
// under it, and the well-known icon of what is missing above them.
import { type JSX, Animated, createAnimatedValue, reduceMotion, Text, View } from "nsh";
import { t } from "nsh/i18n";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

/** `class` places it (`flex-1` to fill a page); with no `icon`, only its words (a page loading). */
export function Empty(props: { icon?: IconName; title: string; description?: string; action?: JSX.Element; class?: string }) {
  return (
    <View class={`items-center justify-center gap-2 p-8 ${props.class ?? ""}`}>
      <If when={props.icon}>{(name) => <Icon name={name()} size="lg" tone="trim" />}</If>
      <Text class="font-display text-lg tracking-wide text-foreground">{props.title}</Text>
      <If when={props.description}>
        <Text class="max-w-md text-center text-sm text-muted-foreground">{props.description}</Text>
      </If>
      <If when={props.action}>
        <View class="pt-1">{props.action}</View>
      </If>
    </View>
  );
}

export function ErrorState(props: { message: string; onRetry?: () => void }) {
  return (
    <Empty
      icon="triangle-alert"
      title={t("common.loadFailed")}
      description={props.message}
      action={props.onRetry ? <Button label={t("common.retry")} icon="refresh-cw" size="sm" onPress={props.onRetry} /> : undefined}
    />
  );
}

/** A placeholder block that breathes slowly; still with reduced motion. */
export function Skeleton(props: { class?: string }) {
  const pulse = createAnimatedValue(1);
  if (!reduceMotion()) {
    Animated.loop(
      Animated.sequence([Animated.timing(pulse, { toValue: 0.5, duration: 900 }), Animated.timing(pulse, { toValue: 1, duration: 900 })]),
    ).start();
  }
  return <View accessibilityElementsHidden class={`rounded-(--radius) bg-muted ${props.class ?? ""}`} style={{ opacity: pulse }} />;
}

/** A list's placeholder: a few rows of skeletons. */
export function SkeletonList(props: { rows?: number; rowClass?: string }) {
  return (
    <View accessibilityLabel="Loading" class="gap-2">
      <Each of={Array.from({ length: props.rows ?? 5 }, (_, i) => i)}>{() => <Skeleton class={props.rowClass ?? "h-16"} />}</Each>
    </View>
  );
}
