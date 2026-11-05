import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../feltkit/_generated/api.js";
import { AGENT, setup } from "./helpers.js";

test("create workspace: owner, default channels, activity", async () => {
  const { t, ada, ws } = await setup();
  try {
    const me = await ada.query(api.me.get);
    assert.equal(me!.workspaces.find((w: any) => w.id === ws)!.role, "owner");
    const names = (await ada.query(api.channels.list, { workspaceId: ws })).map((c: any) => c.name).sort();
    assert.deepEqual(names, ["general", "random"]);
    const log = await ada.query(api.activity.list, { workspaceId: ws });
    assert.ok(log.some((a: any) => a.type === "workspace.created"));
    assert.ok(log.some((a: any) => a.type === "membership.joined"), "Grace's acceptance is audited");
  } finally { await t.close(); }
});

test("create channel, invite participant, send message, unread counts", async () => {
  const { t, ada, grace, ws } = await setup();
  try {
    const ch = await ada.mutation(api.channels.create, { workspaceId: ws, name: "Launch Plans", kind: "public" });
    assert.equal((await ada.query(api.channels.get, { channelId: ch })).name, "launch-plans");
    // Grace sees the public channel but is not a member until she joins.
    let mine = (await grace.query(api.channels.list, { workspaceId: ws })).find((c: any) => c.id === ch)!;
    assert.equal(mine.isMember, false);
    await grace.mutation(api.channels.join, { channelId: ch });
    await ada.mutation(api.messages.send, { channelId: ch, text: "hello @grace" });
    await ada.mutation(api.messages.send, { channelId: ch, text: "second" });
    mine = (await grace.query(api.channels.list, { workspaceId: ws })).find((c: any) => c.id === ch)!;
    assert.deepEqual([mine.unread, mine.mentions], [2, 1]);
    assert.equal((await ada.query(api.channels.list, { workspaceId: ws })).find((c: any) => c.id === ch)!.unread, 0, "own messages are read");
    const { items } = await grace.query(api.messages.list, { channelId: ch });
    assert.deepEqual(items.map((m: any) => [m.seq, m.text]), [[1, "hello @grace"], [2, "second"]]);
    await grace.mutation(api.channels.markRead, { channelId: ch, seq: 2 });
    assert.equal((await grace.query(api.channels.list, { workspaceId: ws })).find((c: any) => c.id === ch)!.unread, 0);
    const inbox = await grace.query(api.inbox.list, { unread: true });
    assert.equal(inbox[0]?.type, "mention", "a mention notifies through AppPort Services Notifications");
  } finally { await t.close(); }
});

test("thread replies and reactions", async () => {
  const { t, ada, grace, general } = await setup();
  try {
    const root = await ada.mutation(api.messages.send, { channelId: general, text: "Thread me" });
    await grace.mutation(api.messages.send, { channelId: general, text: "reply 1", rootId: root.id });
    await ada.mutation(api.messages.send, { channelId: general, text: "reply 2", rootId: root.id });
    const th = await grace.query(api.messages.thread, { rootId: root.id });
    assert.deepEqual(th.replies.map((r: any) => r.text), ["reply 1", "reply 2"]);
    assert.equal(th.root.replyCount, 2);
    const top = (await ada.query(api.messages.list, { channelId: general })).items;
    assert.deepEqual(top.map((m: any) => m.text), ["Thread me"], "replies stay in the thread");
    assert.deepEqual(await grace.mutation(api.messages.react, { messageId: root.id, emoji: "🎉" }), { added: true });
    await ada.mutation(api.messages.react, { messageId: root.id, emoji: "🎉" });
    let [m] = (await ada.query(api.messages.list, { channelId: general })).items;
    assert.deepEqual(m.reactions.map((r: any) => [r.emoji, r.count, r.mine]), [["🎉", 2, true]]);
    assert.deepEqual(await ada.mutation(api.messages.react, { messageId: root.id, emoji: "🎉" }), { added: false }, "toggle off");
    [m] = (await ada.query(api.messages.list, { channelId: general })).items;
    assert.deepEqual(m.reactions.map((r: any) => [r.count, r.mine]), [[1, false]]);
  } finally { await t.close(); }
});

test("direct messages and group conversations are found again, not duplicated", async () => {
  const { t, ada, grace, ws } = await setup();
  try {
    const graceId = (await grace.query(api.me.get))!.participant.id;
    const dm = await ada.mutation(api.channels.openConversation, { workspaceId: ws, participantIds: [graceId] });
    assert.equal(await grace.mutation(api.channels.openConversation, { workspaceId: ws, participantIds: [(await ada.query(api.me.get))!.participant.id] }), dm);
    await ada.mutation(api.messages.send, { channelId: dm, text: "psst" });
    const row = (await grace.query(api.channels.list, { workspaceId: ws })).find((c: any) => c.id === dm)!;
    assert.deepEqual([row.kind, row.title, row.unread], ["dm", "Ada Lovelace", 1]);
  } finally { await t.close(); }
});

test("search finds messages in readable conversations only", async () => {
  const { t, ada, grace, ws, general } = await setup();
  try {
    await ada.mutation(api.messages.send, { channelId: general, text: "The Quarterly roadmap is ready" });
    const priv = await ada.mutation(api.channels.create, { workspaceId: ws, name: "secret", kind: "private" });
    await ada.mutation(api.messages.send, { channelId: priv, text: "quarterly numbers (private)" });
    assert.equal((await ada.query(api.messages.search, { workspaceId: ws, q: "QUARTERLY" })).length, 2);
    const g = await grace.query(api.messages.search, { workspaceId: ws, q: "quarterly" });
    assert.deepEqual(g.map((m: any) => m.channel.name), ["general"]);
  } finally { await t.close(); }
});

test("upload an attachment, send it, download it", async () => {
  const { t, ada, grace, general } = await setup();
  try {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 10, 13]);
    const base64 = Buffer.from(bytes).toString("base64");
    const a = await ada.mutation(api.attachments.upload, { channelId: general, name: "data.bin", contentType: "application/octet-stream", base64 });
    await ada.mutation(api.messages.send, { channelId: general, text: "see file", attachmentIds: [a.id] });
    const [m] = (await grace.query(api.messages.list, { channelId: general })).items;
    assert.equal(m.attachments[0].name, "data.bin");
    const d = await grace.query(api.attachments.download, { attachmentId: a.id });
    assert.deepEqual([...Buffer.from(d.base64, "base64")], [...bytes], "bytes round-trip exactly");
    assert.equal((await grace.query(api.attachments.list, { channelId: general })).length, 1);
    // The Files service holds the bytes; message records hold only the reference.
    if (t.runtime) {
      const stored = await t.runtime.instance.handle("test").collection<any>("messages").find({});
      assert.ok(!JSON.stringify(stored).includes(base64));
    }
  } finally { await t.close(); }
});

test("add agent, mention it, agent action persists a project plan and posts a reference", async () => {
  const { t, ada, ws } = await setup();
  try {
    await ada.mutation(api.agents.add, { workspaceId: ws });
    const ch = await ada.mutation(api.channels.create, { workspaceId: ws, name: "launch", kind: "public", topic: "Q1 launch" });
    await ada.mutation(api.messages.send, { channelId: ch, text: "Goal: ship the beta by March 14." });
    await ada.mutation(api.messages.send, { channelId: ch, text: "Decided: per-seat pricing." });
    await ada.mutation(api.messages.send, { channelId: ch, text: "I'll write the launch post by Feb 28." });
    await ada.mutation(api.messages.send, { channelId: ch, text: "Risk: SSO vendor is flaky." });
    const ask = await ada.mutation(api.messages.send, { channelId: ch, text: "@assistant summarize this discussion and create a project plan." });
    assert.deepEqual((await ada.query(api.agents.requests, { channelId: ch })).map((r: any) => r.status), ["pending"]);

    const { workQueue } = await import("../agent/worker.js");
    const result = await workQueue(t.as(AGENT));
    assert.deepEqual(result, { handled: 1, failed: 0, skipped: 0 });

    const [req] = await ada.query(api.agents.requests, { channelId: ch });
    assert.equal(req.status, "done");
    const th = await ada.query(api.messages.thread, { rootId: ask.id });
    const reply = th.replies[0];
    assert.equal(reply.author.handle, "assistant");
    assert.ok(reply.shared, "the reply references the persisted plan");
    const plan = await ada.query(api.agents.plan, { id: reply.shared.id });
    assert.equal(plan.kind, "project_plan");
    assert.deepEqual(plan.decisions, ["per-seat pricing"]);
    assert.deepEqual(plan.risks, ["SSO vendor is flaky"]);
    assert.deepEqual(plan.tasks.map((x: any) => [x.owner, x.due]), [["Ada Lovelace", "by Feb 28"]]);
    assert.equal((await ada.query(api.agents.plans, { workspaceId: ws })).length, 1);
    const log = await ada.query(api.activity.list, { workspaceId: ws });
    assert.ok(log.some((a: any) => a.type === "agent.plan.created"));
    assert.equal((await t.as(AGENT).query(api.agents.pending)).length, 0, "nothing left to do");
  } finally { await t.close(); }
});

test("state survives a restart (durable recovery)", async () => {
  const { t, ada, general } = await setup();
  try {
    await ada.mutation(api.messages.send, { channelId: general, text: "durable" });
    await t.restart();
    assert.equal((await t.as("ada").query(api.messages.list, { channelId: general })).items[0].text, "durable");
  } finally { await t.close(); }
});

test("the sample workspace is real, persisted and complete", async () => {
  const { t, grace } = await setup();
  try {
    const ws = await grace.mutation(api.demo.create, {});
    const w = await grace.query(api.workspaces.get, { workspaceId: ws });
    assert.equal(w.myRole, "owner");
    assert.ok(w.members.some((m: any) => m.handle === "assistant" && m.kind === "agent"));
    const chans = await grace.query(api.channels.list, { workspaceId: ws });
    assert.deepEqual(chans.filter((c: any) => c.kind !== "dm").map((c: any) => c.name).sort(), ["design-crit", "general", "launch-q1", "random"]);
    assert.equal(chans.find((c: any) => c.kind === "dm")!.unread, 1);
  } finally { await t.close(); }
});
