import { s } from "@feltdb/feltkit";
import { app, memberships, participants, workspaces } from "./app.js";
import { me as requireMe } from "./_authz.js";
import { baseHandle } from "./_util.js";

const Participant = s.doc(participants);

/** The caller's profile and workspaces, or null before the first me:ensure. */
export const get = app.query({
  access: "authenticated",
  handler: async (ctx) => {
    const principal = ctx.auth.requirePrincipal();
    const [p] = await ctx.db.find(participants, { principalId: principal.id });
    if (!p) return null;
    const mine = await ctx.db.find(memberships, { participantId: p.id });
    const list = [];
    for (const m of mine) {
      const w = await ctx.db.get(workspaces, m.workspaceId);
      if (w) list.push({ id: w.id, name: w.name, description: w.description ?? null, demo: Boolean(w.demo), role: m.role });
    }
    list.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
    return { participant: p, workspaces: list };
  },
});

/** Create the caller's participant on first use. Idempotent. */
export const ensure = app.mutation({
  access: "authenticated",
  args: { displayName: s.optional(s.string({ minLength: 1, maxLength: 80 })) },
  returns: Participant,
  handler: async (ctx, { displayName }) => {
    const principal = ctx.auth.requirePrincipal();
    const [existing] = await ctx.db.find(participants, { principalId: principal.id });
    if (existing) return existing;
    const name = displayName?.trim() || principal.displayName || principal.id;
    const handle = await freeHandle(ctx, baseHandle(principal.type === "user" && principal.id.includes("@") ? principal.id : name));
    const id = await ctx.db.insert(participants, {
      principalId: principal.id,
      kind: principal.type === "agent" ? "agent" : "human",
      ...(principal.type === "agent" ? { agentType: "application" as const } : {}),
      handle,
      displayName: name,
      createdAt: Date.now(),
    });
    return (await ctx.db.get(participants, id))!;
  },
});

export const updateProfile = app.mutation({
  access: "authenticated",
  args: { displayName: s.string({ minLength: 1, maxLength: 80 }), title: s.optional(s.string({ maxLength: 80 })) },
  handler: async (ctx, { displayName, title }) => {
    const p = await requireMe(ctx);
    await ctx.db.patch(participants, p.id, { displayName: displayName.trim(), title: title?.trim() || undefined });
  },
});

export async function freeHandle(ctx: { db: { find(c: any, f: any): Promise<any[]> } }, base: string): Promise<string> {
  for (let n = 0; n < 1000; n++) {
    const h = n === 0 ? base : `${base.slice(0, 28)}${n + 1}`;
    if (!(await ctx.db.find(participants, { handle: h })).length) return h;
  }
  return `${base.slice(0, 20)}-${Date.now() % 100000}`;
}
