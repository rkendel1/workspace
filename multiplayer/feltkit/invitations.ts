import { fail, s } from "@feltdb/feltkit";
import { app, invitations, participants, workspaces } from "./app.js";
import { me, requireWorkspace } from "./_authz.js";
import { addToWorkspace } from "./_ops.js";
import { record } from "./_util.js";

const WEEK = 7 * 24 * 3600 * 1000;

/**
 * Invitations are bearer links: the invitation id (a FeltDB-generated identifier) is the code.
 * Admins invite anyone; members may invite members and guests. Nobody can invite above their role.
 */
export const create = app.mutation({
  access: "invitations.write",
  args: { workspaceId: s.string(), role: s.enum(["admin", "member", "guest"]), note: s.optional(s.string({ maxLength: 120 })) },
  returns: s.object({ id: s.string(), expiresAt: s.number() }),
  capability: { name: "invitations.create", description: "Create an invitation link to a workspace." },
  handler: async (ctx, { workspaceId, role, note }) => {
    const { participant, membership } = await requireWorkspace(ctx, workspaceId, "member");
    if (role === "admin" && membership.role !== "owner" && membership.role !== "admin") fail("FORBIDDEN", "Only admins can invite admins.");
    const now = Date.now();
    const id = await ctx.db.insert(invitations, { workspaceId, role, ...(note?.trim() ? { note: note.trim() } : {}), createdBy: participant.id, createdAt: now, expiresAt: now + WEEK, status: "open" });
    await record(ctx, workspaceId, participant.id, "invitation.created", `${participant.displayName} created a ${role} invitation${note ? ` (${note.trim()})` : ""}`, id);
    return { id, expiresAt: now + WEEK };
  },
});

export const list = app.query({
  access: "invitations.read",
  args: { workspaceId: s.string() },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspace(ctx, workspaceId, "member");
    const now = Date.now();
    return (await ctx.db.find(invitations, { workspaceId }, { orderBy: [{ field: "createdAt", direction: "desc" }] })).map((i) => ({
      id: i.id, role: i.role, note: i.note ?? null, createdAt: i.createdAt, expiresAt: i.expiresAt,
      status: i.status === "open" && i.expiresAt < now ? "expired" : i.status,
    }));
  },
});

export const revoke = app.mutation({
  access: "invitations.write",
  args: { invitationId: s.string() },
  handler: async (ctx, { invitationId }) => {
    const inv = await ctx.db.get(invitations, invitationId);
    if (!inv) fail("NOT_FOUND", "Invitation not found.");
    const { participant, membership } = await requireWorkspace(ctx, inv.workspaceId, "member");
    if (inv.createdBy !== participant.id && membership.role !== "owner" && membership.role !== "admin") fail("FORBIDDEN", "Only admins or the inviter can revoke an invitation.");
    if (inv.status !== "open") fail("FAILED_PRECONDITION", `That invitation is ${inv.status}.`);
    await ctx.db.patch(invitations, invitationId, { status: "revoked" });
    await record(ctx, inv.workspaceId, participant.id, "invitation.revoked", `${participant.displayName} revoked an invitation`, invitationId);
  },
});

/** What an invitation link leads to, for the person holding it (before they join). */
export const preview = app.query({
  access: "authenticated",
  args: { code: s.string() },
  handler: async (ctx, { code }) => {
    const inv = await ctx.db.get(invitations, code);
    if (!inv || inv.status !== "open" || inv.expiresAt < Date.now()) return null;
    const w = await ctx.db.get(workspaces, inv.workspaceId);
    const by = await ctx.db.get(participants, inv.createdBy);
    return w ? { workspaceName: w.name, role: inv.role, invitedBy: by?.displayName ?? null } : null;
  },
});

export const accept = app.mutation({
  access: "authenticated",
  args: { code: s.string() },
  returns: s.string(),
  handler: async (ctx, { code }) => {
    const p = await me(ctx);
    if (p.kind === "agent") fail("FORBIDDEN", "Agents are added by an admin, not by invitation.");
    const inv = await ctx.db.get(invitations, code);
    if (!inv || inv.status !== "open" || inv.expiresAt < Date.now()) fail("NOT_FOUND", "This invitation is invalid, used or expired.");
    await addToWorkspace(ctx, inv.workspaceId, p.id, inv.role, inv.createdBy);
    await ctx.db.patch(invitations, code, { status: "accepted", acceptedBy: p.id, acceptedAt: Date.now() });
    await record(ctx, inv.workspaceId, p.id, "membership.joined", `${p.displayName} joined as ${inv.role}`, p.id);
    const inviter = await ctx.db.get(participants, inv.createdBy);
    if (inviter && !inviter.persona && inviter.kind === "human") {
      ctx.afterCommit.notifications.send({ recipient: inviter.principalId, type: "invitation.accepted", title: `${p.displayName} accepted your invitation`, data: { workspaceId: inv.workspaceId }, idempotencyKey: `invitation:${code}` });
    }
    return inv.workspaceId;
  },
});
