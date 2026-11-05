/**
 * Multiplayer's authorization policy, in one place: `authorize` is registered with
 * `feltkit({ authorize })` (feltkit/app.ts). FeltKit calls it for every call to every function —
 * HTTP, AppPort, MCP, agent actions and jobs, and in the AppBoundry artifact — after the role check
 * and argument validation, before the handler, with the validated arguments and the call's own
 * read-only db. Its reads are fenced at a mutation's commit and tracked by live queries, so a
 * membership revoked mid-call or while a client watches takes effect immediately.
 *
 * Ids from the client are never trusted: each is resolved to the workspace and conversation it
 * belongs to. Unknown ids and ids the caller may not see are refused alike (NOT_FOUND), so a refusal
 * reveals nothing. A function this policy does not recognise is refused (default deny).
 *
 * Handlers do not repeat these checks: they use the loaders below (loadWorkspace, loadChannel) to get
 * the caller's participant, membership and channel.
 */
import { fail, type AuthorizeHook, type AuthorizeRequest } from "@feltdb/feltkit";
import { agentRequests, attachments, channelMembers, channels, invitations, memberships, messages, participants, sharedObjects, type WorkspaceRole } from "./app.js";

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

export function atLeast(role: string, min: WorkspaceRole): boolean {
  return RANK[role as WorkspaceRole] >= RANK[min];
}

// ── The policy ──────────────────────────────────────────────────────────────

/** Functions whose arguments name no workspace resource: identity, onboarding, the agent's own queue, the inbox. */
const UNSCOPED = new Set(["me:get", "me:ensure", "me:updateProfile", "workspaces:create", "demo:create", "invitations:preview", "invitations:accept", "agents:pending", "inbox:list", "inbox:markRead"]);
/** Functions that need a minimum role in the workspace. */
const MIN_ROLE: Record<string, WorkspaceRole> = {
  "workspaces:update": "admin", "workspaces:setRole": "admin", "agents:add": "admin",
  "channels:create": "member", "invitations:create": "member", "invitations:list": "member", "invitations:revoke": "member", "activity:list": "member",
};
/** Mutations on a conversation that a caller who has not joined it may make. */
const NON_MEMBER_WRITES = new Set(["channels:join", "channels:markRead", "channels:leave", "messages:remove"]);
/** Agent queue functions: only the agent a request was made to may work it. */
const AGENT_WORK = new Set(["agents:claim", "agents:context", "agents:respond", "agents:failRequest"]);

const hidden = (): never => fail("NOT_FOUND", "Not found.");

type Target = { workspaceId: string; channelId?: string; agentId?: string };

/**
 * The workspace (and conversation) a call is about, from the arguments that name one. Every
 * function names its resources with these argument names; keep it that way, since a function
 * that names a resource differently is refused here (default deny) until it is added.
 */
async function target(r: AuthorizeRequest): Promise<Target | null> {
  const { args, db } = r;
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  const channelArg = str("channelId") ?? str("typingIn");
  if (channelArg) {
    const c = await db.get(channels, channelArg);
    if (!c || (str("workspaceId") && c.workspaceId !== str("workspaceId"))) return null;
    return { workspaceId: c.workspaceId, channelId: c.id };
  }
  for (const k of ["rootId", "messageId"]) {
    if (str(k)) { const m = await db.get(messages, str(k)!); return m ? { workspaceId: m.workspaceId, channelId: m.channelId } : null; }
  }
  if (str("attachmentId")) { const a = await db.get(attachments, str("attachmentId")!); return a ? { workspaceId: a.workspaceId, channelId: a.channelId } : null; }
  if (str("invitationId")) { const i = await db.get(invitations, str("invitationId")!); return i ? { workspaceId: i.workspaceId } : null; }
  if (str("requestId")) { const q = await db.get(agentRequests, str("requestId")!); return q ? { workspaceId: q.workspaceId, channelId: q.channelId, agentId: q.agentId } : null; }
  if (r.function === "agents:plan" && str("id")) { const o = await db.get(sharedObjects, str("id")!); return o ? { workspaceId: o.workspaceId, channelId: o.channelId } : null; }
  if (str("workspaceId")) return { workspaceId: str("workspaceId")! };
  return null;
}

export const authorize: AuthorizeHook = async (r) => {
  if (UNSCOPED.has(r.function)) return true;
  if (!r.principal) return { allowed: false, code: "UNAUTHORIZED" };
  const [me] = await r.db.find(participants, { principalId: r.principal.id });
  if (!me) fail("FAILED_PRECONDITION", "No profile yet: call me:ensure first.");
  const t = (await target(r)) ?? hidden();
  const [m] = await r.db.find(memberships, { workspaceId: t.workspaceId, participantId: me.id });
  if (!m) hidden();
  const min = MIN_ROLE[r.function];
  if (min && !atLeast(m.role, min)) return { allowed: false, code: "FORBIDDEN", reason: `This needs the ${min} role in this workspace (you are ${m.role}).` };
  if (AGENT_WORK.has(r.function) && t.agentId !== me.id) hidden();
  if (!t.channelId) return true;
  const channel = (await r.db.get(channels, t.channelId))!;
  const [member] = await r.db.find(channelMembers, { channelId: channel.id, participantId: me.id });
  // Public channels are readable by members of the workspace except guests and agents, who see only
  // conversations they were added to. Private channels, DMs and groups: their members only.
  const openToRole = channel.kind === "public" && m.role !== "guest" && m.role !== "agent";
  if (!member && !openToRole) hidden();
  if (r.kind === "mutation" && !member && !NON_MEMBER_WRITES.has(r.function)) {
    return { allowed: false, code: "FORBIDDEN", reason: "Join the channel to post in it." };
  }
  return true;
};

// ── Loaders (no policy: `authorize` has already decided) ─────────────────────

/** Thrown when a loader finds what the policy should have refused: a policy bug, refused closed. */
const policyGap = (what: string): never => fail("INTERNAL", `authorize admitted a call without ${what}.`);

/** The caller's participant record. */
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

/** The caller's participant and membership in a workspace. */
export async function loadWorkspace(ctx: Ctx, workspaceId: string) {
  const participant = await me(ctx);
  const m = (await membership(ctx, workspaceId, participant.id)) ?? policyGap("a workspace membership");
  return { participant, membership: m };
}

/** A conversation, with the caller's participant, workspace membership and channel membership (null if not joined). */
export async function loadChannel(ctx: Ctx, channelId: string) {
  const channel: Doc = (await ctx.db.get(channels, channelId)) ?? hidden();
  const participant = await me(ctx);
  const m = (await membership(ctx, channel.workspaceId, participant.id)) ?? policyGap("a workspace membership");
  const [member] = await ctx.db.find(channelMembers, { channelId, participantId: participant.id });
  return { channel, participant, membership: m, member: (member ?? null) as Doc | null };
}

/** The conversations the caller can read in a workspace (filters lists and search; not a gate). */
export async function readableChannels(ctx: Ctx, workspaceId: string, participantId: string, role: string): Promise<Doc[]> {
  const all: Doc[] = await ctx.db.find(channels, { workspaceId });
  const mine = new Set((await ctx.db.find(channelMembers, { workspaceId, participantId })).map((m: Doc) => m.channelId));
  const openToRole = role !== "guest" && role !== "agent";
  return all.filter((c) => mine.has(c.id) || (c.kind === "public" && openToRole));
}
