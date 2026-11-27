// The service on Cloudflare Workers (free plan), not deployed yet: see README.md.
//
// - Every hour: poe.ninja's price pages for the league, saved to R2 as they came (`raw/<league>/<day>/<hour>/`). The
//   bodies are streamed, never parsed, so the hourly run spends almost no CPU, and the history starts building up.
// - Every day: the latest hour read back, made a snapshot, and a filter written for each strictness
//   (`filters/<league>/<strictness>.filter`), with the snapshot beside it. Parsing 10 MB of JSON is more than the free
//   plan's 10 ms of CPU: this run needs Workers Paid.
// - GET /filters/<strictness>.filter: the day's filter, for whoever has the access token (one, for now: members
//   later).

import { generateFilter, type Strictness } from "./filter";
import { USER_AGENT, currentLeague, parsePage, sources, toSnapshot } from "./ninja";

interface Env {
  MARKET: R2Bucket;
  /** Set with `wrangler secret put ACCESS_TOKEN`. */
  ACCESS_TOKEN: string;
}

const STRICTNESS: Strictness[] = ["soft", "regular", "strict"];
const DAILY = "17 3 * * *";

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const league = await currentLeague();
    if (event.cron === DAILY) ctx.waitUntil(daily(env, league));
    else ctx.waitUntil(hourly(env, league, new Date(event.scheduledTime)));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/filters\/(soft|regular|strict)\.filter$/);
    if (!match) return new Response("Not found", { status: 404 });
    if (!env.ACCESS_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ACCESS_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const league = await currentLeague();
    const file = await env.MARKET.get(`filters/${league}/${match[1]}.filter`);
    if (!file) return new Response("No filter yet", { status: 404 });
    return new Response(file.body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="POBT-${match[1]}.filter"`,
      },
    });
  },
} satisfies ExportedHandler<Env>;

function hourKey(at: Date): string {
  return `${at.toISOString().slice(0, 10)}/${at.toISOString().slice(11, 13)}`;
}

async function hourly(env: Env, league: string, at: Date) {
  const prefix = `raw/${league}/${hourKey(at)}`;
  await Promise.all(
    sources(league).map(async (source) => {
      const response = await fetch(source.url, { headers: { "user-agent": USER_AGENT } });
      if (!response.ok || !response.body) throw new Error(`${source.page}: HTTP ${response.status}`);
      await env.MARKET.put(`${prefix}/${source.page}.json`, response.body, {
        httpMetadata: { contentType: "application/json" },
      });
    }),
  );
  await env.MARKET.put(`raw/${league}/latest`, prefix);
}

async function daily(env: Env, league: string) {
  const prefix = await (await env.MARKET.get(`raw/${league}/latest`))?.text();
  if (!prefix) return;
  const pages = await Promise.all(
    sources(league).map(async (source) => {
      const body = await env.MARKET.get(`${prefix}/${source.page}.json`);
      return body ? parsePage(source, await body.json()) : [];
    }),
  );
  const at = `${prefix.split("/").slice(2).join("T")}:00:00Z`;
  const snapshot = toSnapshot(league, at, pages.flat());
  await env.MARKET.put(`filters/${league}/snapshot.json`, JSON.stringify(snapshot));
  for (const strictness of STRICTNESS) {
    await env.MARKET.put(`filters/${league}/${strictness}.filter`, generateFilter(snapshot, { strictness }));
  }
}
