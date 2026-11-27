// Ongoing work of unknown length: a ring turning, at rest with reduced motion.
import { Animated, Easing, createAnimatedValue, reduceMotion, View } from "nsh";

export function Spinner(props: { size?: "sm" | "md" }) {
  const turn = createAnimatedValue(0);
  if (!reduceMotion()) {
    Animated.loop(Animated.timing(turn, { toValue: 1, duration: 800, easing: Easing.linear })).start();
  }
  const size = props.size === "sm" ? "size-3.5" : "size-5";
  return (
    <View
      accessibilityLabel="Loading"
      role="progressbar"
      class={`${size} rounded-full border-2 border-muted-foreground/30 border-t-primary`}
      style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}
    />
  );
}
