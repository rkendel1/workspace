/**
 * The room agent process. Runs anywhere that can reach the app over HTTP, with an agent session:
 *
 *   npx feltkit session create --id assistant --type agent --role agent    # prints fks_…
 *   MULTIPLAYER_URL=http://localhost:3000 FELTKIT_AGENT_TOKEN=fks_… npx tsx agent/room-agent.ts
 *
 * It holds no state. It watches its queue through FeltKit's live query (the same change stream the
 * browser uses) and works it through the app's agent capabilities, as itself.
 */
import { createClient } from "@feltdb/feltkit/client";
import { api } from "../feltkit/_generated/api.js";
import { workQueue } from "./worker.js";

const url = process.env.MULTIPLAYER_URL ?? "http://localhost:3000";
const token = process.env.FELTKIT_AGENT_TOKEN;
if (!token) {
  console.error("FELTKIT_AGENT_TOKEN is required (npx feltkit session create --id assistant --type agent --role agent).");
  process.exit(2);
}
let current: string | null = token;
const client = createClient({ url, tokens: { get: () => current, set: (t) => { current = t; } } });
const log = (line: string) => console.log(`${new Date().toISOString()} room-agent ${line}`);

await client.mutation(api.me.ensure, { displayName: "Assistant" });
let busy = false;
let again = false;
async function drain() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    do { again = false; const r = await workQueue(client, undefined, log); if (r.handled || r.failed) log(`handled ${r.handled}, failed ${r.failed}, skipped ${r.skipped}`); } while (again);
  } catch (error: any) {
    log(`error ${error?.code ?? ""} ${error?.message ?? error}`);
  } finally { busy = false; }
}
client.watchQuery(api.agents.pending, undefined, { next: (pending) => { if (pending.length) void drain(); }, error: (e) => log(`watch error ${e.code}: ${e.message}`) });
// Leases expire without a write; look again periodically so an abandoned claim is picked up.
setInterval(() => void drain(), 30_000);
log(`watching ${url}`);
