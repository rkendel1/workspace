import { s } from "@feltdb/feltkit";
import { app, channels, participants, reactions, workspaces } from "./app.js";
import { me } from "./_authz.js";
import { addToWorkspace, ensureRoomAgent, insertMessage, joinChannel } from "./_ops.js";
import { record } from "./_util.js";

/**
 * Onboarding: "Explore a sample workspace". Creates a real workspace (persisted, flagged demo) with
 * sample colleagues (personas: participants with no principal, so nobody can sign in as them), an
 * ongoing launch discussion, a thread, reactions, a private channel, a DM, and the room agent.
 * The caller is its owner; everything in it works like any other workspace.
 */
const PEOPLE = [
  { handle: "maya", displayName: "Maya Chen", title: "Product lead" },
  { handle: "jonas", displayName: "Jonas Weber", title: "Engineering manager" },
  { handle: "priya", displayName: "Priya Raman", title: "Product designer" },
  { handle: "sam", displayName: "Sam Okafor", title: "Marketing" },
] as const;

type Who = (typeof PEOPLE)[number]["handle"];

const LAUNCH: Array<[Who, string]> = [
  ["maya", "Kicking off planning for the Q1 launch of Multiplayer Teams. Goal: public beta by March 14."],
  ["jonas", "Backend is mostly there. We need to finish SSO and the audit log export before the beta."],
  ["priya", "Design review for onboarding is Thursday. I'll have the new invite flow mocks ready by Wednesday."],
  ["sam", "Marketing needs the pricing page copy finalized by Feb 28. Who owns pricing decisions?"],
  ["maya", "Decided: we go with per-seat pricing, free up to 10 seats."],
  ["jonas", "Risk: the SSO vendor's sandbox has been flaky this week, which could slip the beta."],
  ["priya", "@sam I can help with the pricing page layout."],
  ["sam", "Great. I will draft the launch blog post and the email sequence."],
  ["maya", "Jonas, can you own the load test before the beta? We should test with 500 concurrent users."],
  ["jonas", "Yes, I'll run the load test the week of March 2."],
  ["maya", "Open question: do we invite existing customers first or open the waitlist?"],
];

export const create = app.mutation({
  access: "workspaces.write",
  returns: s.string(),
  handler: async (ctx) => {
    const owner = await me(ctx);
    const now = Date.now();
    const ws = await ctx.db.insert(workspaces, { name: "Northwind Labs", description: "Sample workspace: the team behind Multiplayer Teams", createdBy: owner.id, createdAt: now, demo: true });
    const ids = {} as Record<Who, string>;
    for (const p of PEOPLE) {
      const [existing] = await ctx.db.find(participants, { principalId: `persona:${p.handle}` });
      ids[p.handle] = existing?.id ?? (await ctx.db.insert(participants, { principalId: `persona:${p.handle}`, kind: "human", handle: p.handle, displayName: p.displayName, title: p.title, persona: true, createdAt: now }));
    }
    const ch = async (name: string, kind: "public" | "private", topic: string, isDefault = false) =>
      ctx.db.insert(channels, { workspaceId: ws, kind, name, topic, createdBy: ids.maya, createdAt: now, ...(isDefault ? { isDefault: true } : {}) });
    const general = await ch("general", "public", "Company-wide announcements and work-based matters", true);
    const random = await ch("random", "public", "Non-work banter and water cooler conversation", true);
    const launch = await ch("launch-q1", "public", "Q1 launch of Multiplayer Teams · beta March 14");
    const design = await ch("design-crit", "private", "Work-in-progress design reviews");

    await addToWorkspace(ctx, ws, owner.id, "owner");
    for (const p of PEOPLE) await addToWorkspace(ctx, ws, ids[p.handle], p.handle === "maya" ? "admin" : "member");
    const agentId = await ensureRoomAgent(ctx);
    await addToWorkspace(ctx, ws, agentId, "agent", owner.id);
    for (const pid of [owner.id, ids.maya, ids.jonas, ids.priya, ids.sam]) await joinChannel(ctx, ws, launch, pid);
    for (const pid of [owner.id, ids.priya, ids.maya]) await joinChannel(ctx, ws, design, pid);

    const post = async (channelId: string, who: Who, text: string, root?: { id: string; replyCount: number } | null) => {
      const mentions = PEOPLE.filter((p) => text.includes(`@${p.handle}`)).map((p) => ids[p.handle]);
      return (await insertMessage(ctx, { id: channelId, workspaceId: ws }, ids[who], { text, root: root ?? null, mentions })).id;
    };
    await post(general, "maya", `Welcome to Northwind Labs, ${owner.displayName}! This is where the whole team hangs out. Say hi 👋`);
    await post(general, "sam", "The customer newsletter went out this morning: 41% open rate so far.");
    await post(random, "priya", "Who's in for lunch at the noodle place on Friday?");
    await post(random, "jonas", "Count me in.");
    let first = "";
    for (const [who, text] of LAUNCH) {
      const id = await post(launch, who, text);
      if (!first) first = id;
    }
    await post(launch, "jonas", "Love it. I'll set up the beta environment this week.", { id: first, replyCount: 0 });
    await post(launch, "priya", "Should we include a guided tour in the beta?", { id: first, replyCount: 1 });
    await post(design, "priya", "Invite flow v2 is up for crit: three variants, I lean towards B.");
    for (const [who, emoji] of [["jonas", "🚀"], ["sam", "🚀"], ["priya", "🎉"]] as const) {
      await ctx.db.insert(reactions, { workspaceId: ws, channelId: launch, messageId: first, participantId: ids[who], emoji, createdAt: now });
    }
    // A direct message waiting for the new owner.
    const dmIds = [owner.id, ids.maya].sort();
    const dm = await ctx.db.insert(channels, { workspaceId: ws, kind: "dm", name: "dm", dmKey: dmIds.join(","), createdBy: ids.maya, createdAt: now });
    for (const pid of dmIds) await joinChannel(ctx, ws, dm, pid);
    await post(dm, "maya", "Hey! Could you take a look at #launch-q1 and ask @assistant to summarize it into a project plan?");
    await record(ctx, ws, owner.id, "workspace.created", `${owner.displayName} created the sample workspace`, ws);
    return ws;
  },
});
