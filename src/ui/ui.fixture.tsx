import { mount, View } from "nsh";
import { Text } from "./text";

mount(() => (
  <View>
    <Text variant="title">Hello title</Text>
    <Text>{"Hello body"}</Text>
  </View>
));
