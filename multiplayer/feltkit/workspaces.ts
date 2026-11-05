import { fail, s } from "@feltdb/feltkit";
import { app, channelMembers, channels, memberships, participants, presence, workspaces } from "./app.js";
import { atLeast, me, requireWorkspace } from "./_authz.js";
import { addToWorkspace, joinChannel } from "./_ops.js";
import { record } from "./_util.js";

export const create = app.mutation({
  access: "workspaces.write",
  args: { name: s.string({ minLength: 1, maxLength: 60 }), description: s.optional(s.string({ maxLength: 280 })) },
  returns: s.string(),
  capability: { name: "workspaces.create", description: "Create a workspace; the caller becomes its owner." },
  handler: async (ctx, { name, description }) => {
    const p = await me(ctx);
    const now = Date.now();
    const id = await ctx.db.insert(workspaces, { name: name.trim(), ...(description?.trim() ? { description: description.trim() } : {}), createdBy: p.id, createdAt: now });
    for (const [n, topic] of [["general", "Company-wide announcements and work-based matters"], ["random", "Non-work banter and water cooler conversation"]] as const) {
      await ctx.db.insert(channels, { workspaceId: id, kind: "public", name: n, topic, createdBy: p.id, createdAt: now, isDefault: true });
    }
    await addToWorkspace(ctx, id, p.id, "owner");
    await record(ctx, id, p.id, "workspace.created", `${p.displayName} created the workspace`, id);
    return id;
  },
});

/** Workspace header data and its members, with presence. Members only. */
export const get = app.query({
  access: "workspaces.read",
  args: { workspaceId: s.string() },
  handler: async (ctx, { workspaceId }) => {
    const { membership } = await requireWorkspace(ctx, workspaceId);
    const w = (await ctx.db.get(workspaces, workspaceId))!;
    const ms = await ctx.db.find(memberships, { workspaceId });
    const pres = new Map((await ctx.db.find(presence, { workspaceId })).map((p) => [p.participantId, p]));
    const members = [];
    for (const m of ms) {
      const p = await ctx.db.get(participants, m.participantId);
      if (!p) continue;
      const pr = pres.get(p.id);
      members.push({
        participantId: p.id, handle: p.handle, displayName: p.displayName, title: p.title ?? null, kind: p.kind, agentType: p.agentType ?? null, persona: Boolean(p.persona),
        role: m.role, joinedAt: m.joinedAt, lastSeenAt: pr?.lastSeenAt ?? null, status: pr?.status ?? null,
        typingIn: pr?.typingIn ?? null, typingUntil: pr?.typingUntil ?? null,
      });
    }
    members.sort((a, b) => (a.displayName.toLowerCase() < b.displayName.toLowerCase() ? -1 : 1));
    return { id: w.id, name: w.name, description: w.description ?? null, demo: Boolean(w.demo), myRole: membership.role, members, now: Date.now() };
  },
});

export const update = app.mutation({
  access: "workspaces.write",
  args: { workspaceId: s.string(), name: s.string({ minLength: 1, maxLength: 60 }), description: s.optional(s.string({ maxLength: 280 })) },
  handler: async (ctx, { workspaceId, name, description }) => {
    const { participant } = await requireWorkspace(ctx, workspaceId, "admin");
    await ctx.db.patch(workspaces, workspaceId, { name: name.trim(), description: description?.trim() || undefined });
    await record(ctx, workspaceId, participant.id, "workspace.updated", `${participant.displayName} renamed the workspace to ${name.trim()}`);
  },
});

export const setRole = app.mutation({
  access: "workspaces.write",
  args: { workspaceId: s.string(), participantId: s.string(), role: s.enum(["admin", "member", "guest"]) },
  handler: async (ctx, { workspaceId, participantId, role }) => {
    const { participant, membership } = await requireWorkspace(ctx, workspaceId, "admin");
    const [target] = await ctx.db.find(memberships, { workspaceId, participantId });
    if (!target) fail("NOT_FOUND", "That person is not in this workspace.");
    if (target.role === "owner" || target.role === "agent") fail("FAILED_PRECONDITION", `The ${target.role} role cannot be changed here.`);
    if (role === "admin" && membership.role !== "owner") fail("FORBIDDEN", "Only the owner can make admins.");
    if (target.role === "admin" && membership.role !== "owner") fail("FORBIDDEN", "Only the owner can change an admin's role.");
    await ctx.db.patch(memberships, target.id, { role });
    const p = await ctx.db.get(participants, participantId);
    await record(ctx, workspaceId, participant.id, "membership.role", `${participant.displayName} made ${p?.displayName ?? participantId} ${role}`, participantId);
  },
});

/** Remove a member (admins), or leave (anyone but the owner). Channel memberships go with it. */
export const removeMember = app.mutation({
  access: "workspaces.write",
  args: { workspaceId: s.string(), participantId: s.string() },
  handler: async (ctx, { workspaceId, participantId }) => {
    const { participant, membership } = await requireWorkspace(ctx, workspaceId);
    const self = participantId === participant.id;
    if (!self && !atLeast(membership.role, "admin")) fail("FORBIDDEN", "Only admins can remove members.");
    const [target] = await ctx.db.find(memberships, { workspaceId, participantId });
    if (!target) fail("NOT_FOUND", "That person is not in this workspace.");
    if (target.role === "owner") fail("FAILED_PRECONDITION", "The owner cannot leave or be removed.");
    if (target.role === "admin" && !self && membership.role !== "owner") fail("FORBIDDEN", "Only the owner can remove an admin.");
    for (const cm of await ctx.db.find(channelMembers, { workspaceId, participantId })) await ctx.db.delete(channelMembers, cm.id);
    for (const pr of await ctx.db.find(presence, { workspaceId, participantId })) await ctx.db.delete(presence, pr.id);
    await ctx.db.delete(memberships, target.id);
    const p = await ctx.db.get(participants, participantId);
    await record(ctx, workspaceId, participant.id, self ? "membership.left" : "membership.removed", self ? `${participant.displayName} left the workspace` : `${participant.displayName} removed ${p?.displayName ?? participantId}`, participantId);
  },
});

