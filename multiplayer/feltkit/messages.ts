import { fail, s } from "@feltdb/feltkit";
import { agentRequests, app, attachments, memberships, messages, participants, reactions, sharedObjects } from "./app.js";
import { readableChannels, loadChannel, loadWorkspace } from "./_authz.js";
import { insertMessage, joinChannel } from "./_ops.js";
import { mentionedHandles, record } from "./_util.js";

const PAGE = 60;

/** Messages and reactions shaped for the UI, with author names resolved once. */
async function present(ctx: any, list: any[], participantId: string) {
  const names = new Map<string, any>();
  const author = async (id: string) => {
    if (!names.has(id)) names.set(id, await ctx.db.get(participants, id));
    const p = names.get(id);
    return p ? { id: p.id, displayName: p.displayName, handle: p.handle, kind: p.kind } : { id, displayName: "Former member", handle: "unknown", kind: "human" };
  };
  const out = [];
  for (const m of list) {
    const rs = await ctx.db.find(reactions, { messageId: m.id });
    const grouped = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
    for (const r of rs) {
      const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] as string[] };
      g.count++;
      g.mine ||= r.participantId === participantId;
      g.names.push((await author(r.participantId)).displayName);
      grouped.set(r.emoji, g);
    }
    let shared = null;
    if (m.sharedObjectId) {
      const o = await ctx.db.get(sharedObjects, m.sharedObjectId);
      if (o) shared = { id: o.id, kind: o.kind, title: o.title, tasks: o.tasks.length };
    }
    const deleted = Boolean(m.deletedAt);
    out.push({
      id: m.id, channelId: m.channelId, seq: m.seq, rootId: m.rootId ?? null, author: await author(m.authorId),
      text: deleted ? "" : m.text, deleted, createdAt: m.createdAt, editedAt: m.editedAt ?? null,
      replyCount: m.replyCount, lastReplyAt: m.lastReplyAt ?? null, mentions: m.mentions,
      attachments: deleted ? [] : m.attachments, reactions: [...grouped.values()], shared,
    });
  }
  return out;
}

/** The latest top-level messages in a conversation (or older ones, before `beforeSeq`). */
export const list = app.query({
  access: "messages.read",
  args: { channelId: s.string(), beforeSeq: s.optional(s.number()) },
  handler: async (ctx, { channelId, beforeSeq }) => {
    const { participant } = await loadChannel(ctx, channelId);
    const where: any[] = [{ field: "channelId", eq: channelId }, { field: "topLevel", eq: true }];
    if (beforeSeq !== undefined) where.push({ field: "seq", lt: beforeSeq });
    const page = await ctx.db.query(messages, { where, orderBy: [{ field: "seq", direction: "desc" }], limit: PAGE });
    const items = await present(ctx, page.records.reverse(), participant.id);
    return { items, hasMore: !page.exhausted || page.records.length === PAGE };
  },
});

/** A thread: the root message and every reply. */
export const thread = app.query({
  access: "messages.read",
  args: { rootId: s.string() },
  handler: async (ctx, { rootId }) => {
    const root = await ctx.db.get(messages, rootId);
    if (!root) fail("NOT_FOUND", "Message not found.");
    const { participant } = await loadChannel(ctx, root.channelId);
    const replies = await ctx.db.find(messages, { rootId }, { orderBy: [{ field: "seq", direction: "asc" }] });
    const [r, ...rest] = await present(ctx, [root, ...replies], participant.id);
    return { root: r!, replies: rest };
  },
});

const Attach = s.array(s.string(), { maxItems: 10 });

export const send = app.mutation({
  access: "messages.write",
  // Concurrent posts to one conversation contend on its sequence; re-run (the handler is pure FeltDB + afterCommit).
  retry: { sequenceConflicts: 3 },
  args: { channelId: s.string(), text: s.string({ maxLength: 8000 }), rootId: s.optional(s.string()), attachmentIds: s.optional(Attach), sharedObjectId: s.optional(s.string()) },
  returns: s.object({ id: s.string(), seq: s.number() }),
  capability: { name: "messages.post", description: "Post a message (or a thread reply) in a conversation the caller belongs to. @handles mention members." },
  handler: async (ctx, { channelId, text, rootId, attachmentIds, sharedObjectId }) => {
    const { channel, participant } = await loadChannel(ctx, channelId);
    const body = text.trim();
    if (!body && !attachmentIds?.length) fail("INVALID_ARGUMENT", "A message needs text or a file.");
    let root = null;
    if (rootId) {
      root = await ctx.db.get(messages, rootId);
      if (!root || root.channelId !== channelId) fail("NOT_FOUND", "Thread not found.");
      if (root.rootId) fail("INVALID_ARGUMENT", "Reply to the thread's first message.");
    }
    if (sharedObjectId) {
      const o = await ctx.db.get(sharedObjects, sharedObjectId);
      if (!o || o.channelId !== channelId) fail("NOT_FOUND", "Shared object not found in this conversation.");
    }
    // Files must have been uploaded into this conversation by this caller and not used yet.
    const files = [];
    for (const aid of attachmentIds ?? []) {
      const a = await ctx.db.get(attachments, aid);
      if (!a || a.channelId !== channelId || a.uploaderId !== participant.id || a.messageId) fail("NOT_FOUND", "Attachment not found.");
      files.push(a);
    }
    // Mentions resolve to workspace members only.
    const mentioned = [];
    for (const h of mentionedHandles(body)) {
      const [p] = await ctx.db.find(participants, { handle: h });
      if (p && (await ctx.db.find(memberships, { workspaceId: channel.workspaceId, participantId: p.id })).length) mentioned.push(p);
    }
    const { id, seq, now } = await insertMessage(ctx, channel, participant.id, {
      text: body, root, mentions: mentioned.map((p) => p.id), sharedObjectId,
      attachments: files.map((f) => ({ id: f.id, name: f.name, size: f.size, contentType: f.contentType })),
    });
    for (const f of files) await ctx.db.patch(attachments, f.id, { messageId: id });

    for (const p of mentioned) {
      if (p.id === participant.id) continue;
      if (p.kind === "agent") {
        // A person asking an agent: the agent must be in the conversation to read it. The person,
        // who can see the conversation, brings it in; the agent then works under its own identity.
        if (participant.kind === "agent") continue; // agents do not trigger agents (no loops)
        await joinChannel(ctx, channel.workspaceId, channelId, p.id);
        await ctx.db.insert(agentRequests, { workspaceId: channel.workspaceId, channelId, messageId: id, agentId: p.id, requestedBy: participant.id, prompt: body, status: "pending", createdAt: now });
        await record(ctx, channel.workspaceId, participant.id, "agent.requested", `${participant.displayName} asked @${p.handle}: ${body.slice(0, 120)}`, id);
      } else if (!p.persona) {
        ctx.afterCommit.notifications.send({
          recipient: p.principalId, type: "mention", title: `${participant.displayName} mentioned you`,
          body: body.slice(0, 200), data: { workspaceId: channel.workspaceId, channelId, messageId: id }, idempotencyKey: `mention:${id}:${p.id}`,
        });
      }
    }
    return { id, seq };
  },
});

export const edit = app.mutation({
  access: "messages.write",
  args: { messageId: s.string(), text: s.string({ minLength: 1, maxLength: 8000 }) },
  handler: async (ctx, { messageId, text }) => {
    const m = await ctx.db.get(messages, messageId);
    if (!m) fail("NOT_FOUND", "Message not found.");
    const { participant } = await loadChannel(ctx, m.channelId);
    if (m.authorId !== participant.id) fail("FORBIDDEN", "You can only edit your own messages.");
    if (m.deletedAt) fail("FAILED_PRECONDITION", "That message was deleted.");
    await ctx.db.patch(messages, messageId, { text: text.trim(), editedAt: Date.now() });
  },
});

/** Soft delete: the record stays (threads and reactions point at it); its text and files do not show. */
export const remove = app.mutation({
  access: "messages.write",
  args: { messageId: s.string() },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messages, messageId);
    if (!m) fail("NOT_FOUND", "Message not found.");
    const { participant, membership } = await loadChannel(ctx, m.channelId);
    const moderator = membership.role === "owner" || membership.role === "admin";
    if (m.authorId !== participant.id && !moderator) fail("FORBIDDEN", "You can only delete your own messages.");
    await ctx.db.patch(messages, messageId, { deletedAt: Date.now() });
    if (m.authorId !== participant.id) await record(ctx, m.workspaceId, participant.id, "message.moderated", `${participant.displayName} deleted a message`, messageId);
  },
});

/** Add or remove the caller's reaction. */
export const react = app.mutation({
  access: "messages.write",
  args: { messageId: s.string(), emoji: s.string({ minLength: 1, maxLength: 16 }) },
  returns: s.object({ added: s.boolean() }),
  handler: async (ctx, { messageId, emoji }) => {
    const m = await ctx.db.get(messages, messageId);
    if (!m || m.deletedAt) fail("NOT_FOUND", "Message not found.");
    const { participant } = await loadChannel(ctx, m.channelId);
    const [existing] = await ctx.db.find(reactions, { messageId, participantId: participant.id, emoji });
    if (existing) {
      await ctx.db.delete(reactions, existing.id);
      return { added: false };
    }
    await ctx.db.insert(reactions, { workspaceId: m.workspaceId, channelId: m.channelId, messageId, participantId: participant.id, emoji, createdAt: Date.now() });
    return { added: true };
  },
});

/** Case-insensitive search over the conversations the caller can read (FK-GAP-006: a scan). */
export const search = app.query({
  access: "messages.read",
  args: { workspaceId: s.string(), q: s.string({ minLength: 1, maxLength: 200 }) },
  handler: async (ctx, { workspaceId, q }) => {
    const { participant, membership } = await loadWorkspace(ctx, workspaceId);
    const readable = new Map((await readableChannels(ctx, workspaceId, participant.id, membership.role)).map((c) => [c.id, c]));
    const needle = q.trim().toLowerCase();
    const hits = (await ctx.db.find(messages, { workspaceId }))
      .filter((m) => readable.has(m.channelId) && !m.deletedAt && m.text.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    const items = await present(ctx, hits, participant.id);
    return items.map((m) => {
      const c = readable.get(m.channelId)!;
      return { ...m, channel: { id: c.id, kind: c.kind, name: c.name } };
    });
  },
});

