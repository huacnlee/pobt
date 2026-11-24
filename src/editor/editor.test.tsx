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


// Needs an installed Path of Building. Changing a slot's item goes through POB's own slot drop-down.
test("equips another item in a slot through POB's slot drop-down", async () => {
  const app = await open("./editor.fixture.tsx", { width: 1400, height: 900, platform: "macos" });
  await app.waitFor("text:Total Life", { timeout: 25000 });
  await app.press("text:Items");
  await app.waitFor("label:Weapon 1: Empty", { timeout: 15000 });
  await app.press("label:Weapon 1: Empty");
  await app.waitFor("label:Item in this slot", { timeout: 5000 });
  console.log("before open", app.count("text:Woe Razor, Sabre"));
  await app.press("label:Item in this slot");
  console.log("after open", app.count("text:Woe Razor, Sabre"));
  await app.hover("text:Woe Razor, Sabre >> nth=1");
  await app.wait(400);
  await app.press("text:Woe Razor, Sabre >> nth=1");
  await app.waitFor("label:Weapon 1: Woe Razor, Sabre", { timeout: 15000 });
  await app.waitFor("text:No usable weapon equipped", { timeout: 15000 });
});
