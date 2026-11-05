import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../feltkit/_generated/api.js";
import { AGENT, rejects, setup } from "./helpers.js";

test("unauthorized workspace access: outsiders get NOT_FOUND everywhere", async () => {
  const { t, ada, mallory, ws, general } = await setup();
  try {
    await rejects(mallory.query(api.workspaces.get, { workspaceId: ws }), "NOT_FOUND");
    await rejects(mallory.query(api.channels.list, { workspaceId: ws }), "NOT_FOUND");
    await rejects(mallory.query(api.activity.list, { workspaceId: ws }), "NOT_FOUND");
    await rejects(mallory.query(api.messages.list, { channelId: general }), "NOT_FOUND");
    await rejects(mallory.mutation(api.messages.send, { channelId: general, text: "hi" }), "NOT_FOUND");
    await rejects(mallory.mutation(api.channels.join, { channelId: general }), "NOT_FOUND");
    await rejects(mallory.mutation(api.invitations.create, { workspaceId: ws, role: "admin" }), "NOT_FOUND");
    const root = await ada.mutation(api.messages.send, { channelId: general, text: "x" });
    await rejects(mallory.mutation(api.messages.react, { messageId: root.id, emoji: "👍" }), "NOT_FOUND");
    await rejects(mallory.query(api.messages.thread, { rootId: root.id }), "NOT_FOUND");
    await rejects(t.query(api.channels.list, { workspaceId: ws }), "UNAUTHORIZED");
  } finally { await t.close(); }
});

test("cross-tenant queries: client-supplied ids from another workspace are refused", async () => {
  const { t, ada, mallory, ws, general, malloryWs } = await setup();
  try {
    // Mallory, inside her own workspace, names Acme's channel: refused, nothing leaks into search.
    await ada.mutation(api.messages.send, { channelId: general, text: "acme secret plans" });
    assert.deepEqual(await mallory.query(api.messages.search, { workspaceId: malloryWs, q: "secret" }), []);
    await rejects(mallory.query(api.messages.search, { workspaceId: ws, q: "secret" }), "NOT_FOUND");
    // Open a DM with someone in another workspace: refused.
    const adaId = (await ada.query(api.me.get))!.participant.id;
    await rejects(mallory.mutation(api.channels.openConversation, { workspaceId: malloryWs, participantIds: [adaId] }), "NOT_FOUND");
    // Add Ada to a channel in Mallory's workspace: refused.
    const evil = await mallory.mutation(api.channels.create, { workspaceId: malloryWs, name: "trap", kind: "private" });
    await rejects(mallory.mutation(api.channels.addMembers, { channelId: evil, participantIds: [adaId] }), "NOT_FOUND");
    // Mention someone outside the workspace: no notification, no mention recorded.
    const sent = await mallory.mutation(api.messages.send, { channelId: evil, text: "@ada look" });
    const [m] = (await mallory.query(api.messages.list, { channelId: evil })).items;
    assert.equal(m.id, sent.id);
    assert.deepEqual(m.mentions, []);
    assert.deepEqual((await ada.query(api.inbox.list, { unread: true })).filter((n: any) => n.type === "mention"), []);
  } finally { await t.close(); }
});

test("unauthorized channel access: private channels are invisible to non-members", async () => {
  const { t, ada, grace, ws } = await setup();
  try {
    const priv = await ada.mutation(api.channels.create, { workspaceId: ws, name: "leadership", kind: "private" });
    await ada.mutation(api.messages.send, { channelId: priv, text: "confidential" });
    assert.ok(!(await grace.query(api.channels.list, { workspaceId: ws })).some((c: any) => c.id === priv));
    await rejects(grace.query(api.messages.list, { channelId: priv }), "NOT_FOUND");
    await rejects(grace.query(api.channels.get, { channelId: priv }), "NOT_FOUND");
    await rejects(grace.mutation(api.channels.join, { channelId: priv }), "NOT_FOUND");
    await rejects(grace.mutation(api.presence.heartbeat, { workspaceId: ws, status: "active", typingIn: priv }), "NOT_FOUND");
    const graceId = (await grace.query(api.me.get))!.participant.id;
    await ada.mutation(api.channels.addMembers, { channelId: priv, participantIds: [graceId] });
    assert.equal((await grace.query(api.messages.list, { channelId: priv })).items[0].text, "confidential");
  } finally { await t.close(); }
});

test("unauthorized direct-message access: only the participants", async () => {
  const { t, ada, grace, ws } = await setup();
  try {
    const alan = t.as("alan");
    await alan.mutation(api.me.ensure, {});
    const inv = await ada.mutation(api.invitations.create, { workspaceId: ws, role: "member" });
    await alan.mutation(api.invitations.accept, { code: inv.code });
    const graceId = (await grace.query(api.me.get))!.participant.id;
    const dm = await ada.mutation(api.channels.openConversation, { workspaceId: ws, participantIds: [graceId] });
    await ada.mutation(api.messages.send, { channelId: dm, text: "between us" });
    await rejects(alan.query(api.messages.list, { channelId: dm }), "NOT_FOUND");
    await rejects(alan.mutation(api.messages.send, { channelId: dm, text: "hi" }), "NOT_FOUND");
    assert.equal((await alan.query(api.messages.search, { workspaceId: ws, q: "between" })).length, 0);
    // Even the workspace owner cannot read a DM they are not in.
    const alanId = (await alan.query(api.me.get))!.participant.id;
    const gdm = await grace.mutation(api.channels.openConversation, { workspaceId: ws, participantIds: [alanId] });
    await rejects(ada.query(api.messages.list, { channelId: gdm }), "NOT_FOUND");
  } finally { await t.close(); }
});

test("role-based access and invitation authorization", async () => {
  const { t, ada, grace, mallory, ws } = await setup();
  try {
    const graceId = (await grace.query(api.me.get))!.participant.id;
    // Members cannot invite admins, change roles, or rename the workspace.
    await rejects(grace.mutation(api.invitations.create, { workspaceId: ws, role: "admin" }), "FORBIDDEN");
    await rejects(grace.mutation(api.workspaces.setRole, { workspaceId: ws, participantId: graceId, role: "admin" }), "FORBIDDEN");
    await rejects(grace.mutation(api.workspaces.update, { workspaceId: ws, name: "Mine" }), "FORBIDDEN");
    // Guests: invited as guest, see only channels they are added to (not public ones).
    const alan = t.as("alan");
    await alan.mutation(api.me.ensure, {});
    const guestInv = await grace.mutation(api.invitations.create, { workspaceId: ws, role: "guest" });
    await alan.mutation(api.invitations.accept, { code: guestInv.code });
    assert.deepEqual(await alan.query(api.channels.list, { workspaceId: ws }), []);
    await rejects(alan.mutation(api.channels.create, { workspaceId: ws, name: "x", kind: "public" }), "FORBIDDEN");
    await rejects(alan.query(api.activity.list, { workspaceId: ws }), "FORBIDDEN");
    // The link carries a 256-bit code from ctx.crypto.token(); the record id is not a code.
    assert.match(guestInv.code, /^[A-Za-z0-9_-]{43}$/);
    await rejects(mallory.mutation(api.invitations.accept, { code: guestInv.id }), "NOT_FOUND");
    // Invitations work once, and revoked ones never.
    await rejects(t.as("alan").mutation(api.invitations.accept, { code: guestInv.code }), "NOT_FOUND");
    const inv = await ada.mutation(api.invitations.create, { workspaceId: ws, role: "member" });
    await ada.mutation(api.invitations.revoke, { invitationId: inv.id });
    await rejects(mallory.mutation(api.invitations.accept, { code: inv.code }), ["NOT_FOUND", "FAILED_PRECONDITION"]);
    // The workspace's AppPort permission alone is not enough: a principal without the app role is refused before the handler.
    await rejects(t.as({ id: "noroles", type: "user", roles: [] }).query(api.channels.list, { workspaceId: ws }), "FORBIDDEN");
  } finally { await t.close(); }
});

test("unauthorized membership changes", async () => {
  const { t, ada, grace, ws } = await setup();
  try {
    const adaId = (await ada.query(api.me.get))!.participant.id;
    const graceId = (await grace.query(api.me.get))!.participant.id;
    await rejects(grace.mutation(api.workspaces.removeMember, { workspaceId: ws, participantId: adaId }), "FORBIDDEN");
    await rejects(ada.mutation(api.workspaces.removeMember, { workspaceId: ws, participantId: adaId }), "FAILED_PRECONDITION");
    await ada.mutation(api.workspaces.setRole, { workspaceId: ws, participantId: graceId, role: "admin" });
    await rejects(grace.mutation(api.workspaces.removeMember, { workspaceId: ws, participantId: adaId }), "FAILED_PRECONDITION", );
    await ada.mutation(api.workspaces.removeMember, { workspaceId: ws, participantId: graceId });
    await rejects(grace.query(api.workspaces.get, { workspaceId: ws }), "NOT_FOUND");
    const log = await ada.query(api.activity.list, { workspaceId: ws });
    assert.ok(log.some((a: any) => a.type === "membership.removed") && log.some((a: any) => a.type === "membership.role"));
  } finally { await t.close(); }
});

test("unauthorized file access", async () => {
  const { t, ada, grace, mallory, ws } = await setup();
  try {
    const priv = await ada.mutation(api.channels.create, { workspaceId: ws, name: "files", kind: "private" });
    const a = await ada.mutation(api.attachments.upload, { channelId: priv, name: "secret.txt", contentType: "text/plain", base64: Buffer.from("top secret").toString("base64") });
    await ada.mutation(api.messages.send, { channelId: priv, text: "file", attachmentIds: [a.id] });
    await rejects(grace.query(api.attachments.download, { attachmentId: a.id }), "NOT_FOUND");
    await rejects(mallory.query(api.attachments.download, { attachmentId: a.id }), "NOT_FOUND");
    await rejects(mallory.query(api.attachments.list, { channelId: priv }), "NOT_FOUND");
    // An attachment cannot be re-attached by someone else, or into another conversation.
    const general = (await ada.query(api.channels.list, { workspaceId: ws })).find((c: any) => c.name === "general")!.id;
    await rejects(grace.mutation(api.messages.send, { channelId: general, text: "steal", attachmentIds: [a.id] }), "NOT_FOUND");
    await rejects(ada.mutation(api.messages.send, { channelId: general, text: "move", attachmentIds: [a.id] }), "NOT_FOUND");
  } finally { await t.close(); }
});

test("agent permission escalation is refused at both layers", async () => {
  const { t, ada, grace, ws, general } = await setup();
  try {
    const agent = t.as(AGENT);
    await agent.mutation(api.me.ensure, {});
    // Not added to the workspace yet: cannot read anything.
    await rejects(agent.query(api.messages.list, { channelId: general }), "NOT_FOUND");
    await ada.mutation(api.agents.add, { workspaceId: ws });
    // App-role layer (AppPort): agents cannot call people's functions at all.
    await rejects(agent.mutation(api.workspaces.create, { name: "agent land" }), "FORBIDDEN");
    await rejects(agent.mutation(api.invitations.create, { workspaceId: ws, role: "admin" }), "FORBIDDEN");
    await rejects(agent.mutation(api.channels.create, { workspaceId: ws, name: "x", kind: "public" }), "FORBIDDEN");
    await rejects(agent.mutation(api.workspaces.setRole, { workspaceId: ws, participantId: "x", role: "admin" }), "FORBIDDEN");
    await rejects(agent.query(api.attachments.list, { channelId: general }), "FORBIDDEN");
    // Membership layer: a workspace agent does not see public channels it was not brought into.
    await rejects(agent.query(api.messages.list, { channelId: general }), "NOT_FOUND");
    await rejects(agent.mutation(api.messages.send, { channelId: general, text: "hi" }), "NOT_FOUND");
    // A private conversation it is mentioned in from outside does not open up: Grace can't bring it into a DM she isn't in.
    const priv = await ada.mutation(api.channels.create, { workspaceId: ws, name: "board", kind: "private" });
    await ada.mutation(api.messages.send, { channelId: priv, text: "confidential board notes" });
    await rejects(grace.mutation(api.messages.send, { channelId: priv, text: "@assistant summarize" }), "NOT_FOUND");
    // Mentioned in #general by a member, the agent can work that request only.
    await ada.mutation(api.messages.send, { channelId: general, text: "@assistant summarize this" });
    const [req] = await agent.query(api.agents.pending);
    const ctx = await (await agent.mutation(api.agents.claim, { requestId: req.id }), agent.query(api.agents.context, { requestId: req.id }));
    assert.ok(!JSON.stringify(ctx).includes("confidential"));
    await rejects(agent.query(api.messages.list, { channelId: priv }), "NOT_FOUND");
    // A person cannot work the agent's queue or impersonate its reply.
    await rejects(ada.mutation(api.agents.respond, { requestId: req.id, text: "fake" }), "FORBIDDEN");
    // Another agent principal cannot touch this agent's requests.
    const rogue = t.as({ id: "rogue-bot", type: "agent", roles: ["agent"] });
    await rogue.mutation(api.me.ensure, {});
    await rejects(rogue.mutation(api.agents.respond, { requestId: req.id, text: "fake" }), "NOT_FOUND");
    await rejects(rogue.query(api.agents.context, { requestId: req.id }), "NOT_FOUND");
    // Agents cannot accept invitations to get in.
    const inv = await ada.mutation(api.invitations.create, { workspaceId: ws, role: "member" });
    await rejects(rogue.mutation(api.invitations.accept, { code: inv.code }), "FORBIDDEN");
  } finally { await t.close(); }
});

test("two workers racing for one request: exactly one answers", async () => {
  const { t, ada, ws, general } = await setup();
  try {
    await ada.mutation(api.agents.add, { workspaceId: ws });
    await ada.mutation(api.messages.send, { channelId: general, text: "@assistant summarize" });
    const { workQueue } = await import("../agent/worker.js");
    const [a, b] = await Promise.all([workQueue(t.as(AGENT)), workQueue(t.as(AGENT))]);
    assert.equal(a.handled + b.handled, 1);
    const top = (await ada.query(api.messages.list, { channelId: general })).items;
    const th = await ada.query(api.messages.thread, { rootId: top[0].id });
    assert.equal(th.replies.filter((r: any) => r.author.handle === "assistant").length, 1);
  } finally { await t.close(); }
});
