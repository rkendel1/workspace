/**
 * The room agent's work loop, independent of transport: `caller` is anything that runs the app's
 * functions as the agent principal in one workspace (FeltKit's HTTP client in production,
 * createTestApp().as(agent, { tenant }) in tests). The queue is durable in FeltDB, so a crash at any
 * point loses nothing: an unclaimed request stays pending, a claimed one is re-offered when its lease
 * expires, and respond is one transaction.
 *
 * The agent works in every workspace it is a FeltKit member of: `workEveryWorkspace` lists them
 * (GET /api/tenants) and switches its session into each (POST /api/tenants/switch, a new token)
 * before working that workspace's queue. A workspace it was removed from is no longer listed.
 */
import { api } from "../feltkit/_generated/api.js";
import { composeDeterministic, type Composer } from "./compose.js";

export interface Caller {
  query(fn: any, args?: any): Promise<any>;
  mutation(fn: any, args?: any): Promise<any>;
}

export interface WorkResult { handled: number; failed: number; skipped: number }

/** A FeltKit client holding the agent's session (createClient from @feltdb/feltkit/client). */
export interface TenantCaller extends Caller {
  tenants(): Promise<{ tenants: Array<{ id: string; name: string }>; current: { id: string } | null }>;
  switchTenant(tenantId: string | null): Promise<unknown>;
}

/** Work the queue of every workspace the agent belongs to, one after another. */
export async function workEveryWorkspace(client: TenantCaller, compose: Composer = composeDeterministic, log: (line: string) => void = () => {}): Promise<WorkResult & { workspaces: number }> {
  const total = { handled: 0, failed: 0, skipped: 0, workspaces: 0 };
  const { tenants, current } = await client.tenants();
  let here = current?.id ?? null;
  for (const tenant of tenants) {
    if (here !== tenant.id) { await client.switchTenant(tenant.id); here = tenant.id; }
    await client.mutation(api.me.ensure, { displayName: "Assistant" });
    const r = await workQueue(client, compose, (line) => log(`[${tenant.name}] ${line}`));
    total.handled += r.handled; total.failed += r.failed; total.skipped += r.skipped; total.workspaces++;
  }
  return total;
}

export async function workQueue(caller: Caller, compose: Composer = composeDeterministic, log: (line: string) => void = () => {}): Promise<WorkResult> {
  const result: WorkResult = { handled: 0, failed: 0, skipped: 0 };
  const queue: Array<{ id: string; prompt: string }> = await caller.query(api.agents.pending);
  for (const item of queue) {
    try {
      await caller.mutation(api.agents.claim, { requestId: item.id });
    } catch (error: any) {
      // Another worker took it (CONFLICT) or it is no longer open.
      if (error?.code === "CONFLICT" || error?.code === "FAILED_PRECONDITION") { result.skipped++; continue; }
      throw error;
    }
    try {
      const context = await caller.query(api.agents.context, { requestId: item.id });
      const reply = await compose(context);
      await caller.mutation(api.agents.respond, { requestId: item.id, text: reply.text, ...(reply.plan ? { plan: reply.plan } : {}) });
      result.handled++;
      log(`answered ${item.id}${reply.plan ? " with a plan" : ""}`);
    } catch (error: any) {
      result.failed++;
      log(`failed ${item.id}: ${error?.code ?? ""} ${error?.message ?? error}`);
      await caller.mutation(api.agents.failRequest, { requestId: item.id, error: String(error?.message ?? error).slice(0, 500) }).catch(() => undefined);
    }
  }
  return result;
}
