import { s } from "@feltdb/feltkit";
import { app, participants, presence, roster } from "./app.js";
import { loadWorkspace } from "./_authz.js";

/**
 * The session's workspace (FeltKit's: name, and the caller's role there) and its directory, with
 * presence. Creating, renaming, members, roles and invitations are FeltKit's (`/api/tenants/…`).
 */
export const get = app.query({
  access: "workspaces.read",
  args: { workspaceId: s.optional(s.string()) },
  handler: async (ctx) => {
    const { workspaceId, workspaceName, role } = await loadWorkspace(ctx);
    const pres = new Map((await ctx.db.find(presence, {})).map((p) => [p.participantId, p]));
    const members = [];
    for (const m of await ctx.db.find(roster, {})) {
      const p = await ctx.db.get(participants, m.participantId);
      if (!p) continue;
      const pr = pres.get(p.id);
      members.push({
        participantId: p.id, handle: p.handle, displayName: p.displayName, title: p.title ?? null, kind: p.kind, agentType: p.agentType ?? null, persona: Boolean(p.persona),
        joinedAt: m.joinedAt, lastSeenAt: pr?.lastSeenAt ?? null, status: pr?.status ?? null,
        typingIn: pr?.typingIn ?? null, typingUntil: pr?.typingUntil ?? null,
      });
    }
    members.sort((a, b) => (a.displayName.toLowerCase() < b.displayName.toLowerCase() ? -1 : 1));
    return { id: workspaceId, name: workspaceName, myRole: role, members, now: Date.now() };
  },
});
