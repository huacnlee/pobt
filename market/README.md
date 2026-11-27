# POBT market

Path of Exile 1 prices, and the loot filter made from them. One score drives both: what a drop is worth once it is
turned into chaos orbs.

```
worth = unit price × stack × liquidity − cost to sell
```

- **Stack**: a drop is priced as it lies on the ground. One Orb of Alteration is nothing; a stack of 60 is worth a look.
- **Liquidity** (0–1): how surely it sells. Currency and cards trade at once on Faustus's exchange and start near 1;
  items wait for a buyer, so they are discounted by how many others sell the same thing, and more when the price
  swings.
- **Cost to sell**: a fixed number of chaos for the stash space, the wait and the trade. It is why a 10 c unique nobody
  buys is worth about nothing late in a league.

The numbers (`DEFAULT_MODEL` in `src/value.ts`) are a first guess, to be tuned with saved prices and with what picking
things up feels like.

## The filter

`src/filter.ts` writes a standard `.filter`. Four tiers by worth, each with one look, sound, beam and minimap icon for
every kind of item: **1 divine+**, **20 c – 1 divine**, **5 – 20 c**, and **the threshold – 5 c**. Below the threshold
(the strictness: soft 0.5 c, regular 1 c, strict 5 c, or your own):

| | How it is matched | Below the threshold |
| --- | --- | --- |
| Currency, lifeforce, scarabs, oils… | `BaseType` and `StackSize >=` the stack worth each tier | the single drop hides (never one worth a chaos orb) |
| Divination cards | the same | hidden when strict |
| Uniques | `BaseType` only (a filter cannot see the unique): the median unique of the base, at most two tiers under its best one (Headhunter's belt still gets a look) | shown small and quiet, never hidden |
| Crafting bases | `BaseType`, `ItemLevel >=`, `HasInfluence` | no rule |

Anything without a price is left as the game shows it: nothing unknown is hidden.

## Try it

```sh
bun install
bun test
bun src/cli.ts filter --strictness regular            # POBT.filter from the current league's prices
bun src/cli.ts snapshot --out today.json              # the prices, to tune the model on
bun src/cli.ts filter --snapshot today.json --min-worth 3
```

Copy the `.filter` into `Documents/My Games/Path of Exile` and choose it in the game (Options → UI → Item Filter).

## The service

`src/worker.ts` runs on Cloudflare Workers' free plan (`wrangler.jsonc`), with an R2 bucket:

- **Every hour** it saves poe.ninja's price pages to R2 untouched, copied and not parsed, so the run costs almost no
  CPU. This is the price history, worth starting early.
- **Every day** it reads the last hour back and writes a filter for each strictness, with the snapshot.
- **`GET /filters/<soft|regular|strict>.filter`** serves the day's filter to whoever has the access token.

The free plan gives a run 10 ms of CPU. Copying the hourly pages fits; the daily filter does not (poe.ninja's
`BaseType` page alone is 9 MB of JSON to parse), so the daily run needs Workers Paid, or the filter is built where
CPU is free: the CLI, a scheduled CI job, or POBT itself.

It is not deployed. With an account: `bunx wrangler r2 bucket create pobt-market`,
`bunx wrangler secret put ACCESS_TOKEN`, `bunx wrangler deploy`.

## Sources

| Source | What | Used |
| --- | --- | --- |
| poe.ninja `exchange/current/overview` | currency, fragments, cards, oils, essences, fossils…: price and chaos traded a day, 7-day change | yes |
| poe.ninja `stash/current/item/overview` | uniques and bases: price, listings, item level, influence, 7-day change | yes |
| `web.poecdn.com/api/currency-exchange/<hour>` | GGG's own exchange history, every market's volume and ratios, by hour (no current hour) | later |
| Public stash stream, trade site | minute-level listings, single items | need GGG's approval |

poe.ninja's API runs its own site and is not offered as a product: no versioning, heavy users blocked, a User-Agent
that says who calls. Nothing written allows or forbids paid use; ask before charging for anything built on it.
