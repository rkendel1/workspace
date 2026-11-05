/**
 * The room agent process. Runs anywhere that can reach the app over HTTP, with an agent session:
 *
 *   npx feltkit session create --id assistant --type agent --role agent    # prints fks_…
 *   MULTIPLAYER_URL=http://localhost:3000 FELTKIT_AGENT_TOKEN=fks_… npx tsx agent/room-agent.ts
 *
 * In development, ROOM_AGENT_DEV=1 instead signs in as the "assistant" dev user (feltkit/app.ts).
 *
 * A workspace admin adds it (Workspace settings → Add @assistant, i.e. FeltKit's addMember with the
 * role "agent"). It holds no state. It lists the workspaces it belongs to, switches its session into
 * each (FeltKit rotates the token; the client keeps the new one) and works that workspace's queue
 * through the app's agent capabilities, as itself. It watches the current workspace's queue live and
 * looks at every workspace periodically.
 */
import { createClient } from "@feltdb/feltkit/client";
import { api } from "../feltkit/_generated/api.js";
import { workEveryWorkspace } from "./worker.js";

const url = process.env.MULTIPLAYER_URL ?? "http://localhost:3000";
const token = process.env.FELTKIT_AGENT_TOKEN;
const dev = process.env.ROOM_AGENT_DEV === "1";
const every = Number(process.env.ROOM_AGENT_INTERVAL_MS ?? 5_000);
if (!token && !dev) {
  console.error("FELTKIT_AGENT_TOKEN is required (npx feltkit session create --id assistant --type agent --role agent).");
  process.exit(2);
}
let current: string | null = token ?? null;
// Bearer session (not a browser): switching workspaces replaces the token, which this store keeps.
const client = createClient({ url, tokens: { get: () => current, set: (t) => { current = t; } } });
const log = (line: string) => console.log(`${new Date().toISOString()} room-agent ${line}`);

if (!token) await client.signInAsDevUser("assistant");
await client.mutation(api.me.ensure, { displayName: "Assistant" });
let busy = false;
let again = false;
async function drain() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    do {
      again = false;
      const r = await workEveryWorkspace(client, undefined, log);
      if (r.handled || r.failed) log(`${r.workspaces} workspace(s): handled ${r.handled}, failed ${r.failed}, skipped ${r.skipped}`);
    } while (again);
  } catch (error: any) {
    log(`error ${error?.code ?? ""} ${error?.message ?? error}`);
  } finally { busy = false; }
}
// Live: the queue of the workspace the session is in now (re-run by FeltKit after every switch).
client.watchQuery(api.agents.pending, undefined, { next: (pending) => { if (pending.length) void drain(); }, error: (e) => log(`watch error ${e.code}: ${e.message}`) });
// Other workspaces, newly joined ones, and expired leases: look again periodically.
setInterval(() => void drain(), every);
void drain();
log(`watching ${url}`);
