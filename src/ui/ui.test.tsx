import { expect, open, test } from "nsh/test";

test("ui Text shows its children", async () => {
  const app = await open("./ui.fixture.tsx");
  await app.waitFor("text:Hello title");
  expect(app.texts()).toContain("Hello body");
});
