import { expect, open, test } from "nsh/test";

test("ui Text shows its children", async () => {
  const app = await open("./ui.fixture.tsx");
  await app.waitFor("text:Hello title");
  expect(app.texts()).toContain("Hello body");
});

test("ui Checkbox shows its check only while checked", async () => {
  const app = await open("./ui.fixture.tsx");
  await app.waitFor("text:Remember");
  expect(app.texts()).not.toContain("✓");
  await app.press("text:Remember");
  await app.waitFor("text:✓");
  await app.press("text:Remember");
  await app.waitUntil(() => !app.texts().includes("✓"));
});
