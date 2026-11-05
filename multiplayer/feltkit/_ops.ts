/** Write helpers shared by function modules (membership side effects). */
import { channelMembers, channels, memberships, messages, participants } from "./app.js";

type W = { db: { find(c: any, f?: any): Promise<any[]>; insert(c: any, v: any): Promise<string> } };

/** Add a participant to a workspace and its default channels. Idempotent. */
export async function addToWorkspace(ctx: W, workspaceId: string, participantId: string, role: string, invitedBy?: string) {
  const [existing] = await ctx.db.find(memberships, { workspaceId, participantId });
  if (existing) return existing.id as string;
  const id = await ctx.db.insert(memberships, { workspaceId, participantId, role, joinedAt: Date.now(), ...(invitedBy ? { invitedBy } : {}) });
  if (role !== "agent" && role !== "guest") {
    for (const c of await ctx.db.find(channels, { workspaceId, isDefault: true })) await joinChannel(ctx, workspaceId, c.id, participantId);
  }
  return id;
}

export async function joinChannel(ctx: W, workspaceId: string, channelId: string, participantId: string) {
  const [existing] = await ctx.db.find(channelMembers, { channelId, participantId });
  if (existing) return existing.id as string;
  return ctx.db.insert(channelMembers, { workspaceId, channelId, participantId, lastReadSeq: 0, joinedAt: Date.now() });
}

/** Insert a message at the conversation's next sequence number. Callers have authorized the author. */
export async function insertMessage(
  ctx: W & { db: { sequence(name: string): Promise<number>; get(c: any, id: string): Promise<any>; patch(c: any, id: string, v: any): Promise<any> } },
  channel: { id: string; workspaceId: string },
  authorId: string,
  fields: { text: string; root?: { id: string; replyCount: number } | null; mentions?: string[]; attachments?: any[]; sharedObjectId?: string },
) {
  const seq = await ctx.db.sequence(`msg:${channel.id}`);
  const now = Date.now();
  const id = await ctx.db.insert(messages, {
    workspaceId: channel.workspaceId, channelId: channel.id, seq, authorId, text: fields.text,
    ...(fields.root ? { rootId: fields.root.id } : {}), topLevel: !fields.root, replyCount: 0,
    mentions: fields.mentions ?? [], attachments: fields.attachments ?? [],
    ...(fields.sharedObjectId ? { sharedObjectId: fields.sharedObjectId } : {}), createdAt: now,
  });
  if (fields.root) await ctx.db.patch(messages, fields.root.id, { replyCount: fields.root.replyCount + 1, lastReplyAt: now });
  const [member] = await ctx.db.find(channelMembers, { channelId: channel.id, participantId: authorId });
  if (member && member.lastReadSeq < seq) await ctx.db.patch(channelMembers, member.id, { lastReadSeq: seq });
  return { id, seq, now };
}

/** The application-owned room agent's principal id: its worker signs in with an agent session of this id. */
export const ROOM_AGENT = "assistant";

export async function ensureRoomAgent(ctx: W): Promise<string> {
  const [existing] = await ctx.db.find(participants, { principalId: ROOM_AGENT });
  if (existing) return existing.id;
  return ctx.db.insert(participants, {
    principalId: ROOM_AGENT, kind: "agent", agentType: "application", handle: ROOM_AGENT, displayName: "Assistant",
    title: "Room agent · summaries and project plans", createdAt: Date.now(),
  });
}
