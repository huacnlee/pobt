// The build editor alone, opening testdata/build.xml on the launcher's Path of Building: for editor.test.tsx.
import { mount, View } from "nsh";
import { BuildEditor } from "./BuildEditor";

mount(() => (
  <View class="flex-1">
    <BuildEditor game="poe1" file="src/editor/testdata/build.xml" onBack={() => {}} />
  </View>
));
