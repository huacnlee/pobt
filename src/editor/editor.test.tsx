import { expect, open, test } from "nsh/test";

// Needs an installed Path of Building (the launcher's settings).
test("opens a build on the official Path of Building and shows its sidebar", async () => {
  const app = await open("./editor.fixture.tsx");
  await app.waitFor("text:Total Life", { timeout: 25000 });
  const texts = app.texts();
  console.log(texts.slice(0, 80).join(" | "));
  expect(texts).toContain("3,605");
  // The header's points line is POB's own ("118 / 123   8 / 8").
  expect(texts.some((t) => t.includes("118 / 123"))).toBe(true);
});

