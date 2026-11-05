/** Write helpers shared by function modules (directory and channel membership side effects). */
import { channelMembers, channels, messages, participants, roster } from "./app.js";

type W = { db: { find(c: any, f?: any): Promise<any[]>; insert(c: any, v: any): Promise<string> } };

const DEFAULT_CHANNELS = [["general", "Company-wide announcements and work-based matters"], ["random", "Non-work banter and water cooler conversation"]] as const;

/**
 * List a participant in the session's workspace directory and, unless they are a guest or an agent,
 * add them to its default channels. Idempotent. Returns true the first time. (Who may be in the
 * workspace at all is FeltKit's membership; this is the application's side of joining.)
 */
export async function enterWorkspace(ctx: W, workspaceId: string, participantId: string, role: string): Promise<boolean> {
  const [existing] = await ctx.db.find(roster, { participantId });
  if (existing) return false;
  await ctx.db.insert(roster, { workspaceId, participantId, joinedAt: Date.now() });
  if (role !== "agent" && role !== "guest") {
    for (const c of await ctx.db.find(channels, { isDefault: true })) await joinChannel(ctx, workspaceId, c.id, participantId);
  }
  return true;
}

/** A new workspace's default channels (#general, #random), created by the first person to work in it. */
export async function ensureDefaultChannels(ctx: W, workspaceId: string, createdBy: string): Promise<boolean> {
  if ((await ctx.db.find(channels, { isDefault: true })).length) return false;
  for (const [name, topic] of DEFAULT_CHANNELS) {
    await ctx.db.insert(channels, { workspaceId, kind: "public", name, topic, createdBy, createdAt: Date.now(), isDefault: true });
  }
  return true;
}

/** Whether a participant is listed in the session's workspace directory. */
export async function inWorkspace(ctx: W, participantId: string): Promise<boolean> {
  return (await ctx.db.find(roster, { participantId })).length > 0;
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
