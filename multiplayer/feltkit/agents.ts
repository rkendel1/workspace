import { fail, s } from "@feltdb/feltkit";
import { agentRequests, app, messages, participants, sharedObjects } from "./app.js";

const Pending = s.array(s.object({ id: s.string(), workspaceId: s.string(), channelId: s.string(), prompt: s.string(), createdAt: s.number() }));
const Context = s.object({
  request: s.object({ id: s.string(), prompt: s.string(), requestedBy: s.string(), requestedByHandle: s.nullable(s.string()) }),
  channel: s.object({ id: s.string(), name: s.string(), kind: s.string(), topic: s.nullable(s.string()) }),
  messages: s.array(s.object({ id: s.string(), author: s.string(), handle: s.string(), authorKind: s.string(), text: s.string(), createdAt: s.number() })),
});
import { me, readableChannels, requireChannel, requireWorkspace } from "./_authz.js";
import { addToWorkspace, ensureRoomAgent, insertMessage, ROOM_AGENT } from "./_ops.js";
import { record } from "./_util.js";

/**
 * The room agent (FK-GAP-008). People ask it by @mention (messages:send records an agentRequest).
 * The agent is an external worker holding its own agent session (principal ROOM_AGENT); it works
 * its queue through these capabilities, so AppPort role checks and workspace/channel membership
 * apply to it exactly as to a person. It can only read conversations it was brought into.
 */
const LEASE_MS = 2 * 60 * 1000;

/** Add the room agent to a workspace (admins). */
export const add = app.mutation({
  access: "workspaces.write",
  args: { workspaceId: s.string() },
  returns: s.string(),
  handler: async (ctx, { workspaceId }) => {
    const { participant } = await requireWorkspace(ctx, workspaceId, "admin");
    const agentId = await ensureRoomAgent(ctx);
    await addToWorkspace(ctx, workspaceId, agentId, "agent", participant.id);
    await record(ctx, workspaceId, participant.id, "agent.added", `${participant.displayName} added @${ROOM_AGENT} to the workspace`, agentId);
    return agentId;
  },
});

async function myRequest(ctx: any, requestId: string) {
  const agent = await me(ctx);
  const req = await ctx.db.get(agentRequests, requestId);
  if (!req || req.agentId !== agent.id) fail("NOT_FOUND", "Request not found.");
  return { agent, req };
}

/** The calling agent's open requests (pending, or working with an expired lease). */
export const pending = app.query({
  access: "agents.work",
  returns: Pending,
  capability: { name: "agent.pending", description: "Requests waiting for the calling agent." },
  handler: async (ctx) => {
    const principal = ctx.auth.requirePrincipal();
    const [agent] = await ctx.db.find(participants, { principalId: principal.id });
    if (!agent) return [];
    const now = Date.now();
    const open = [
      ...(await ctx.db.find(agentRequests, { agentId: agent.id, status: "pending" })),
      ...(await ctx.db.find(agentRequests, { agentId: agent.id, status: "working" })).filter((r) => (r.claimedAt ?? 0) + LEASE_MS < now),
    ];
    return open.sort((a, b) => a.createdAt - b.createdAt).map((r) => ({ id: r.id, workspaceId: r.workspaceId, channelId: r.channelId, prompt: r.prompt, createdAt: r.createdAt }));
  },
});

/** Take a request. Two workers claiming the same one: FeltDB's commit check lets one win (CONFLICT). */
export const claim = app.mutation({
  access: "agents.work",
  args: { requestId: s.string() },
  returns: s.object({ claimedAt: s.number() }),
  capability: { name: "agent.claim", description: "Claim a pending request (a lease of two minutes)." },
  handler: async (ctx, { requestId }) => {
    const { req } = await myRequest(ctx, requestId);
    const now = Date.now();
    const free = req.status === "pending" || (req.status === "working" && (req.claimedAt ?? 0) + LEASE_MS < now);
    if (!free) fail("FAILED_PRECONDITION", `Request is ${req.status}.`);
    await ctx.db.patch(agentRequests, requestId, { status: "working", claimedAt: now });
    return { claimedAt: now };
  },
});

/** What the agent may read to answer: the conversation (it must be a member), up to the request. */
export const context = app.query({
  access: "agents.work",
  args: { requestId: s.string() },
  returns: Context,
  capability: { name: "agent.context", description: "The conversation an agent request was made in, authorized by the agent's own membership." },
  handler: async (ctx, { requestId }) => {
    const { req } = await myRequest(ctx, requestId);
    const { channel } = await requireChannel(ctx, req.channelId);
    const source = (await ctx.db.get(messages, req.messageId))!;
    // The thread the request was made in, or the channel's recent top-level messages.
    const scope = source.rootId
      ? [(await ctx.db.get(messages, source.rootId))!, ...(await ctx.db.find(messages, { rootId: source.rootId }))]
      : (await ctx.db.query(messages, { where: [{ field: "channelId", eq: req.channelId }, { field: "topLevel", eq: true }, { field: "seq", lte: source.seq }], orderBy: [{ field: "seq", direction: "desc" }], limit: 150 })).records;
    const names = new Map<string, any>();
    const out = [];
    for (const m of scope.filter((m: any) => !m.deletedAt).sort((a: any, b: any) => a.seq - b.seq)) {
      if (!names.has(m.authorId)) names.set(m.authorId, await ctx.db.get(participants, m.authorId));
      const a = names.get(m.authorId);
      out.push({ id: m.id, author: a?.displayName ?? "Unknown", handle: a?.handle ?? "unknown", authorKind: a?.kind ?? "human", text: m.text, createdAt: m.createdAt });
    }
    const requester = await ctx.db.get(participants, req.requestedBy);
    return { request: { id: req.id, prompt: req.prompt, requestedBy: requester?.displayName ?? "someone", requestedByHandle: requester?.handle ?? null }, channel: { id: channel.id, name: channel.name, kind: channel.kind, topic: channel.topic ?? null }, messages: out };
  },
});

const PlanItem = s.object({ title: s.string({ minLength: 1, maxLength: 300 }), owner: s.optional(s.string({ maxLength: 80 })), due: s.optional(s.string({ maxLength: 40 })), sourceMessageId: s.optional(s.string()) });
const Plan = s.object({
  title: s.string({ minLength: 1, maxLength: 160 }), summary: s.string({ maxLength: 4000 }),
  goals: s.array(s.string({ maxLength: 300 }), { maxItems: 20 }), tasks: s.array(PlanItem, { maxItems: 50 }),
  decisions: s.array(s.string({ maxLength: 300 }), { maxItems: 20 }), risks: s.array(s.string({ maxLength: 300 }), { maxItems: 20 }),
  openQuestions: s.array(s.string({ maxLength: 300 }), { maxItems: 20 }), sourceMessageIds: s.array(s.string(), { maxItems: 200 }),
});

/**
 * Answer a claimed request, in one FeltDB transaction: persist the plan (if any), post the reply
 * referencing it, close the request, record the activity. Nothing is half-done.
 */
export const respond = app.mutation({
  access: "agents.work",
  retry: { sequenceConflicts: 3 },
  args: { requestId: s.string(), text: s.string({ minLength: 1, maxLength: 8000 }), plan: s.optional(Plan) },
  returns: s.object({ messageId: s.string(), sharedObjectId: s.optional(s.string()) }),
  capability: { name: "agent.respond", description: "Reply to a claimed request and optionally persist a structured project plan in the conversation." },
  handler: async (ctx, { requestId, text, plan }) => {
    const { agent, req } = await myRequest(ctx, requestId);
    if (req.status !== "working") fail("FAILED_PRECONDITION", `Request is ${req.status}; claim it first.`);
    const { channel } = await requireChannel(ctx, req.channelId, { write: true });
    if (plan) ctx.auth.require("plans.write");
    const source = (await ctx.db.get(messages, req.messageId))!;
    const now = Date.now();
    const sharedObjectId = plan
      ? await ctx.db.insert(sharedObjects, { workspaceId: channel.workspaceId, channelId: channel.id, kind: "project_plan", ...plan, createdBy: agent.id, requestedBy: req.requestedBy, createdAt: now })
      : undefined;
    const rootId = source.rootId ?? source.id;
    const root = (await ctx.db.get(messages, rootId))!;
    const requester = await ctx.db.get(participants, req.requestedBy);
    const { id } = await insertMessage(ctx, channel, agent.id, { text, root, mentions: requester ? [requester.id] : [], ...(sharedObjectId ? { sharedObjectId } : {}) });
    await ctx.db.patch(agentRequests, requestId, { status: "done", finishedAt: now, replyId: id, ...(sharedObjectId ? { sharedObjectId } : {}) });
    await record(ctx, channel.workspaceId, agent.id, plan ? "agent.plan.created" : "agent.replied", plan ? `@${agent.handle} created plan "${plan.title}"` : `@${agent.handle} replied`, sharedObjectId ?? id);
    if (requester && requester.kind === "human" && !requester.persona) {
      ctx.afterCommit.notifications.send({ recipient: requester.principalId, type: "agent.replied", title: `@${agent.handle} answered you`, body: text.slice(0, 200), data: { workspaceId: channel.workspaceId, channelId: channel.id, messageId: id }, idempotencyKey: `agent:${requestId}` });
    }
    return { messageId: id, ...(sharedObjectId ? { sharedObjectId } : {}) };
  },
});

export const failRequest = app.mutation({
  access: "agents.work",
  args: { requestId: s.string(), error: s.string({ minLength: 1, maxLength: 500 }) },
  returns: s.null(),
  capability: { name: "agent.fail", description: "Give up on a claimed request with a reason." },
  handler: async (ctx, { requestId, error }) => {
    const { req } = await myRequest(ctx, requestId);
    if (req.status !== "working") fail("FAILED_PRECONDITION", `Request is ${req.status}.`);
    await ctx.db.patch(agentRequests, requestId, { status: "failed", finishedAt: Date.now(), error });
    return null;
  },
});

/** Requests in a conversation and their state (the UI shows "working on it…"). */
export const requests = app.query({
  access: "messages.read",
  args: { channelId: s.string() },
  handler: async (ctx, { channelId }) => {
    await requireChannel(ctx, channelId);
    return (await ctx.db.find(agentRequests, { channelId })).map((r) => ({ id: r.id, messageId: r.messageId, status: r.status, error: r.error ?? null, replyId: r.replyId ?? null }));
  },
});

export const plan = app.query({
  access: "plans.read",
  args: { id: s.string() },
  returns: s.doc(sharedObjects).extend({ createdByName: s.string() }),
  capability: { name: "plans.get", description: "Read a project plan from a conversation the caller can read." },
  handler: async (ctx, { id }) => {
    const o = await ctx.db.get(sharedObjects, id);
    if (!o) fail("NOT_FOUND", "Plan not found.");
    await requireChannel(ctx, o.channelId);
    const author = await ctx.db.get(participants, o.createdBy);
    return { ...o, createdByName: author?.displayName ?? "Unknown" };
  },
});

/** Plans in the conversations the caller can read. */
export const plans = app.query({
  access: "plans.read",
  args: { workspaceId: s.string() },
  handler: async (ctx, { workspaceId }) => {
    const { participant, membership } = await requireWorkspace(ctx, workspaceId);
    const readable = new Set((await readableChannels(ctx, workspaceId, participant.id, membership.role)).map((c) => c.id));
    return (await ctx.db.find(sharedObjects, { workspaceId }, { orderBy: [{ field: "createdAt", direction: "desc" }] }))
      .filter((o) => readable.has(o.channelId))
      .map((o) => ({ id: o.id, channelId: o.channelId, title: o.title, tasks: o.tasks.length, createdAt: o.createdAt }));
  },
});
