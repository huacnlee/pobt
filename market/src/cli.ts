// pobt-market on the command line, to try and tune the model by hand:
//
//   bun src/cli.ts snapshot [--league <name>] [--out snapshot.json]
//   bun src/cli.ts filter [--league <name>] [--snapshot snapshot.json] [--strictness soft|regular|strict]
//                         [--min-worth <chaos>] [--out POBT.filter]
//
// Without a league, the current challenge league. Copy the .filter to Documents/My Games/Path of Exile and pick it
// in the game's options (UI → Item Filter), or reload it there.

import { generateFilter, type Strictness } from "./filter";
import { currentLeague, fetchSnapshot } from "./ninja";
import type { Snapshot } from "./types";

const [command, ...rest] = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < rest.length; i += 2) flags.set(rest[i].replace(/^--/, ""), rest[i + 1]);

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
    const strictness = (flags.get("strictness") ?? "regular") as Strictness;
    const text = generateFilter(shot, { strictness, minWorth });
    const out = flags.get("out") ?? "POBT.filter";
    await Bun.write(out, text);
    console.log(`${shot.league}, ${strictness}: ${text.split("\n\n").length - 1} rules → ${out}`);
  } else {
    console.error("usage: bun src/cli.ts snapshot|filter [--league <name>] …");
    process.exit(2);
  }
}

await main();
