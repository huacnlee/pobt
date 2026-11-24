import { mount, signal, View } from "nsh";
import { Checkbox } from "./fields";
import { ProgressBar } from "./progress";
import { Text } from "./text";

const on = signal(false);

mount(() => (
  <View>
    <Text variant="title">Hello title</Text>
    <Text>{"Hello body"}</Text>
    <Checkbox checked={on()} onChange={(v) => on.set(v)} accessibilityLabel="Remember" label="Remember" />
    <ProgressBar value={0.4} accessibilityLabel="Loading" />
  </View>
));
