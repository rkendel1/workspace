import { s } from "@feltdb/feltkit";
import { app, presence } from "./app.js";
import { loadChannel, loadWorkspace } from "./_authz.js";

/**
 * Presence and typing (FK-GAP-004). FeltKit has no ephemeral channel, so this is one bounded record
 * per participant per workspace, overwritten in place: it never grows, and nothing else depends on
 * it. Clients treat lastSeenAt older than 60 s as offline and typingUntil in the past as not typing.
 */
export const heartbeat = app.mutation({
  access: "presence.write",
  args: { workspaceId: s.optional(s.string()), status: s.enum(["active", "away"]), typingIn: s.optional(s.string()) },
  handler: async (ctx, { status, typingIn }) => {
    const { participant, workspaceId } = await loadWorkspace(ctx);
    if (typingIn) await loadChannel(ctx, typingIn);
    const now = Date.now();
    const fields = { lastSeenAt: now, status, typingIn: typingIn || undefined, typingUntil: typingIn ? now + 5000 : undefined };
    const [existing] = await ctx.db.find(presence, { participantId: participant.id });
    if (existing) await ctx.db.patch(presence, existing.id, fields);
    else await ctx.db.insert(presence, { workspaceId, participantId: participant.id, ...fields });
  },
});
