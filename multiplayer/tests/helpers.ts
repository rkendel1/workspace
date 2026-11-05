import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArtifactTestApp, createTestApp } from "@feltdb/feltkit/testing";
import { api } from "../feltkit/_generated/api.js";

export const AGENT = { id: "assistant", type: "agent" as const, roles: ["agent"] };
export const MALLORY = { id: "mallory", type: "user" as const, displayName: "Mallory", roles: ["member"] };

/** MP_TARGET=artifact runs every test against the compiled AppBoundry artifact (multiplayer.app) instead. */
export const ARTIFACT = process.env.MP_TARGET === "artifact";

/** The app under test: FeltKit's runtime, or the artifact in AppBoundry's reference host on durable state. */
export async function createApp(): Promise<any> {
  if (!ARTIFACT) return createTestApp();
  const stateDir = mkdtempSync(join(tmpdir(), "mp-artifact-"));
  let app = await createArtifactTestApp("multiplayer.app", { stateDir });
  const facade: any = {
    as: (who: any) => ({ query: (f: any, a?: any) => app.as(who).query(f, a), mutation: (f: any, a?: any) => app.as(who).mutation(f, a) }),
    query: (f: any, a?: any) => app.query(f, a),
    mutation: (f: any, a?: any) => app.mutation(f, a),
    restart: async () => { await app.close(); app = await createArtifactTestApp("multiplayer.app", { stateDir }); },
    close: () => app.close(),
    runtime: null,
  };
  return facade;
}

/** A test app with Ada's workspace, Grace invited as member, and Mallory (signed up, outside it). */
export async function setup() {
  const t = await createApp();
  const ada = t.as("ada");
  const grace = t.as("grace");
  const mallory = t.as(MALLORY);
  for (const c of [ada, grace, mallory]) await c.mutation(api.me.ensure, {});
  const ws = await ada.mutation(api.workspaces.create, { name: "Acme" });
  const inv = await ada.mutation(api.invitations.create, { workspaceId: ws, role: "member" });
  await grace.mutation(api.invitations.accept, { code: inv.id });
  const channels = await ada.query(api.channels.list, { workspaceId: ws });
  const general = channels.find((c: any) => c.name === "general")!.id;
  const malloryWs = await mallory.mutation(api.workspaces.create, { name: "Evil Corp" });
  return { t, ada, grace, mallory, ws, general, malloryWs };
}

export async function rejects(p: Promise<unknown>, code: string | string[]) {
  try {
    await p;
  } catch (e: any) {
    const codes = Array.isArray(code) ? code : [code];
    if (!codes.includes(e?.code)) throw new Error(`expected ${codes.join("|")}, got ${e?.code}: ${e?.message}`);
    return e;
  }
  throw new Error(`expected ${code}, but it succeeded`);
}
