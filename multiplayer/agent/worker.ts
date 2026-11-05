/**
 * The room agent's work loop, independent of transport: `caller` is anything that runs the app's
 * functions as the agent principal (FeltKit's HTTP client in production, createTestApp().as() in tests).
 * The queue is durable in FeltDB, so a crash at any point loses nothing: an unclaimed request stays
 * pending, a claimed one is re-offered when its lease expires, and respond is one transaction.
 */
import { api } from "../feltkit/_generated/api.js";
import { composeDeterministic, type Composer } from "./compose.js";

export interface Caller {
  query(fn: any, args?: any): Promise<any>;
  mutation(fn: any, args?: any): Promise<any>;
}

export interface WorkResult { handled: number; failed: number; skipped: number }

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
