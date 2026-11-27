// pobt-market on the command line, to try and tune the model by hand:
//
//   bun src/cli.ts snapshot [--league <name>] [--out snapshot.json]
//   bun src/cli.ts filter [--league <name>] [--snapshot snapshot.json] [--strictness soft|regular|strict]
//                         [--min-worth <chaos>] [--out POBT.filter]
//
// Without a league, the current challenge league. Copy the .filter to Documents/My Games/Path of Exile and pick it
// in the game's options (UI → Item Filter), or reload it there.

import { MIN_WORTH, generateFilter, type Strictness } from "./filter";
import { currentLeague, fetchSnapshot } from "./ninja";
import type { Snapshot } from "./types";

const [command, ...rest] = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i].startsWith("--") || rest[i + 1] === undefined) fail(`${rest[i]}: every flag takes a value`);
  flags.set(rest[i].slice(2), rest[i + 1]);
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

async function snapshot(): Promise<Snapshot> {
  const file = flags.get("snapshot");
  if (file) return (await Bun.file(file).json()) as Snapshot;
  const league = flags.get("league") ?? (await currentLeague());
  return fetchSnapshot(league);
}

async function main() {
  if (command === "snapshot") {
    const shot = await snapshot();
    const out = flags.get("out") ?? "snapshot.json";
    await Bun.write(out, JSON.stringify(shot, null, 1));
    console.log(`${shot.prices.length} prices of ${shot.league} (1 divine = ${shot.divine.toFixed(0)} c) → ${out}`);
  } else if (command === "filter") {
    const shot = await snapshot();
    const minWorth = flags.has("min-worth") ? Number(flags.get("min-worth")) : undefined;
    if (minWorth !== undefined && !(minWorth >= 0)) fail(`--min-worth: a number of chaos, not ${flags.get("min-worth")}`);
    const strictness = (flags.get("strictness") ?? "regular") as Strictness;
    if (!(strictness in MIN_WORTH)) fail(`--strictness: soft, regular or strict, not ${strictness}`);
    const text = generateFilter(shot, { strictness, minWorth });
    const out = flags.get("out") ?? "POBT.filter";
    await Bun.write(out, text);
    console.log(`${shot.league}, ${strictness}: ${text.split("\n\n").length - 1} rules → ${out}`);
  } else {
    fail("usage: bun src/cli.ts snapshot|filter [--league <name>] …");
  }
}

await main();
