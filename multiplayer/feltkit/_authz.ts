/**
 * Workspace and channel authorization. FeltKit/AppPort already decided the caller may call the
 * function at all; this module decides whether the caller may touch *this* workspace, channel or
 * message. Ids from the client are never trusted: each is loaded and checked against membership.
 *
 * Every refusal is NOT_FOUND for things the caller may not see (no existence oracle across
 * tenants) and FORBIDDEN only where the caller can already see the thing.
 */
import { fail } from "@feltdb/feltkit";
import { channelMembers, channels, memberships, participants, type WorkspaceRole } from "./app.js";

// The handler context type is structural; these helpers take what they use.
type Doc = any;
export interface Ctx {
  auth: { requirePrincipal(): { id: string; type: string; displayName?: string } };
  db: {
    get(c: any, id: string): Promise<any>;
    find(c: any, filter?: any, options?: any): Promise<any[]>;
    query(c: any, request: any): Promise<{ records: any[]; nextCursor?: string; exhausted: boolean }>;
    count(c: any, filter?: any): Promise<number>;
  };
}

const RANK: Record<WorkspaceRole, number> = { guest: 1, agent: 1, member: 2, admin: 3, owner: 4 };

/** The caller's participant record. Refuses a principal that has not joined yet. */
export async function me(ctx: Ctx): Promise<Doc> {
  const principal = ctx.auth.requirePrincipal();
  const [p] = await ctx.db.find(participants, { principalId: principal.id });
  if (!p) fail("FAILED_PRECONDITION", "No profile yet: call me:ensure first.");
  return p;
}

export async function membership(ctx: Ctx, workspaceId: string, participantId: string): Promise<Doc | null> {
  const [m] = await ctx.db.find(memberships, { workspaceId, participantId });
  return m ?? null;
}

/** The caller's membership in a workspace; NOT_FOUND if the caller is not in it. */
export async function requireWorkspace(ctx: Ctx, workspaceId: string, minRole: WorkspaceRole = "guest") {
  const participant = await me(ctx);
  const m = await membership(ctx, workspaceId, participant.id);
  if (!m) fail("NOT_FOUND", "Workspace not found.");
  if (RANK[m.role as WorkspaceRole] < RANK[minRole]) fail("FORBIDDEN", `This needs the ${minRole} role in this workspace (you are ${m.role}).`);
  return { participant, membership: m };
}

export function atLeast(role: string, min: WorkspaceRole): boolean {
  return RANK[role as WorkspaceRole] >= RANK[min];
}

/**
 * Read access to a conversation. Public channels are readable by any workspace member except
 * guests and agents, who see only conversations they were added to. Private channels, DMs and
 * groups are readable by their members only.
 */
export async function requireChannel(ctx: Ctx, channelId: string, opts: { write?: boolean } = {}) {
  const channel: Doc | null = await ctx.db.get(channels, channelId);
  if (!channel) fail("NOT_FOUND", "Conversation not found.");
  const participant = await me(ctx);
  const m = await membership(ctx, channel.workspaceId, participant.id);
  if (!m) fail("NOT_FOUND", "Conversation not found.");
  const [member] = await ctx.db.find(channelMembers, { channelId, participantId: participant.id });
  const openToRole = channel.kind === "public" && m.role !== "guest" && m.role !== "agent";
  if (!member && !openToRole) fail("NOT_FOUND", "Conversation not found.");
  if (opts.write && !member) fail("FORBIDDEN", "Join the channel to post in it.");
  return { channel, participant, membership: m, member: (member ?? null) as Doc | null };
}

/** The ids of conversations the caller can read in a workspace. */
export async function readableChannels(ctx: Ctx, workspaceId: string, participantId: string, role: string): Promise<Doc[]> {
  const all: Doc[] = await ctx.db.find(channels, { workspaceId });
  const mine = new Set((await ctx.db.find(channelMembers, { workspaceId, participantId })).map((m: Doc) => m.channelId));
  const openToRole = role !== "guest" && role !== "agent";
  return all.filter((c) => mine.has(c.id) || (c.kind === "public" && openToRole));
}
