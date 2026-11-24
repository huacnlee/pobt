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


const WIDE = { width: 1400, height: 900, platform: "macos" } as const;

async function itemsPage() {
  const app = await open("./editor.fixture.tsx", WIDE);
  await app.waitFor("text:Total Life", { timeout: 25000 });
  await app.press("text:Items");
  await app.waitFor("label:Weapon 1: Empty", { timeout: 15000 });
  return app;
}

// Needs an installed Path of Building. A slot's item is changed in its drop-down, through POB's own slot control.
test("equips another item in a slot through POB's slot drop-down", async () => {
  const app = await itemsPage();
  await app.press("label:Weapon 1");
  await app.press("text:Woe Razor, Sabre");
  await app.waitFor("label:Weapon 1: Woe Razor, Sabre", { timeout: 15000 });
  // POB's sidebar: this build's skill needs another weapon
  await app.waitFor("text:No usable weapon equipped", { timeout: 15000 });
});

// Needs an installed Path of Building. POB's "Craft item..." window makes a rare of the first base; "Add to build" keeps it.
test("crafts an item in POB's craft window and adds it to the build", async () => {
  const app = await itemsPage();
  await app.press("text:Craft item...");
  await app.waitFor("text:Craft Item", { timeout: 10000 });
  await app.press("text:Create");
  await app.waitFor("text:Add to build", { timeout: 10000 });
  await app.press("text:Add to build");
  await app.waitUntil(() => app.texts().some((t) => t.startsWith("New Item")), { timeout: 15000 });
});

// Needs an installed Path of Building. POB's "Create custom..." window reads the item's text.
test("creates a custom item from its text and adds it to the build", async () => {
  const app = await itemsPage();
  await app.press("text:Create custom...");
  await app.waitFor("label:Item text", { timeout: 10000 });
  await app.type("label:Item text", "Doom Loop\nLeather Belt\n--------\n+40 to maximum Life");
  await app.waitUntil(() => app.enabled("text:Create"), { timeout: 10000 });
  await app.press("text:Create");
  await app.waitFor("text:Add to build", { timeout: 10000 });
  await app.press("text:Add to build");
  await app.waitUntil(() => app.texts().some((t) => t.startsWith("Doom Loop")), { timeout: 15000 });
});

// Needs an installed Path of Building. The AI analysis tab, after Calcs: a build with no report yet asks for one (or
// for an AI to be installed); no AI is run.
test("shows the AI analysis tab after Calcs", async () => {
  const app = await open("./editor.fixture.tsx", WIDE);
  await app.waitFor("text:Total Life", { timeout: 25000 });
  const texts = app.texts();
  expect(texts.indexOf("AI analysis")).toBe(texts.indexOf("Calcs") + 1);
  await app.press("text:AI analysis");
  await app.waitUntil(() => app.texts().some((t) => t.startsWith("Press Analyse") || t === "No AI found"), { timeout: 10000 });
});
