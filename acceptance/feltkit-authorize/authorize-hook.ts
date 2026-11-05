/**
 * Multiplayer's membership policy as ONE feltkit({ authorize }) hook (consumer acceptance for
 * FK-GAP-001). Every call to every function passes through it after roles and validation, with
 * the validated arguments and the call's own read-only db. Ids are resolved to the workspace and
 * conversation they belong to; unknown ids are refused exactly like unauthorized ones.
 */
import { fail, type AuthorizeHook, type AuthorizeRequest } from "@feltdb/feltkit";
import { agentRequests, attachments, channelMembers, channels, invitations, memberships, messages, participants, sharedObjects } from "./app.js";

const RANK: Record<string, number> = { guest: 1, agent: 1, member: 2, admin: 3, owner: 4 };
/** Mutations on a conversation that a non-member may make. */
const NON_MEMBER_WRITES = new Set(["channels:join", "channels:markRead", "channels:leave", "messages:remove"]);
/** Functions that need a minimum workspace role. */
const MIN_ROLE: Record<string, string> = {
  "workspaces:update": "admin", "workspaces:setRole": "admin", "agents:add": "admin",
  "channels:create": "member", "invitations:create": "member", "invitations:list": "member", "activity:list": "member",
};
/** Functions whose arguments name no workspace resource (identity, onboarding, own queue). */
const UNSCOPED = new Set(["me:get", "me:ensure", "me:updateProfile", "workspaces:create", "demo:create", "invitations:preview", "invitations:accept", "agents:pending", "inbox:list", "inbox:markRead"]);

const hidden = () => fail("NOT_FOUND", "Not found.");

async function target(r: AuthorizeRequest): Promise<{ workspaceId: string; channelId?: string } | null> {
  const { args, db } = r;
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  // Every argument that names a conversation. A function that names a resource some other way is
  // not covered by this hook: keep argument names consistent (a central policy depends on it).
  const channelArg = str("channelId") ?? str("typingIn");
  if (channelArg) { const c = await db.get(channels, channelArg); if (!c || (str("workspaceId") && c.workspaceId !== str("workspaceId"))) return null; return { workspaceId: c.workspaceId, channelId: c.id }; }
  for (const k of ["rootId", "messageId"]) if (str(k)) { const m = await db.get(messages, str(k)!); return m ? { workspaceId: m.workspaceId, channelId: m.channelId } : null; }
  if (str("attachmentId")) { const a = await db.get(attachments, str("attachmentId")!); return a ? { workspaceId: a.workspaceId, channelId: a.channelId } : null; }
  if (str("invitationId")) { const i = await db.get(invitations, str("invitationId")!); return i ? { workspaceId: i.workspaceId } : null; }
  if (str("requestId")) { const q = await db.get(agentRequests, str("requestId")!); return q ? { workspaceId: q.workspaceId, channelId: q.channelId } : null; }
  if (str("id") && r.function === "agents:plan") { const o = await db.get(sharedObjects, str("id")!); return o ? { workspaceId: o.workspaceId, channelId: o.channelId } : null; }
  if (str("workspaceId")) return { workspaceId: str("workspaceId")! };
  return null;
}

export const authorize: AuthorizeHook = async (r) => {
  if (UNSCOPED.has(r.function)) return true;
  const principal = r.principal;
  if (!principal) return { allowed: false, code: "UNAUTHORIZED" };
  const [me] = await r.db.find(participants, { principalId: principal.id });
  if (!me) fail("FAILED_PRECONDITION", "No profile yet: call me:ensure first.");
  const t = await target(r);
  if (!t) hidden();
  const [m] = await r.db.find(memberships, { workspaceId: t!.workspaceId, participantId: me!.id });
  if (!m) hidden();
  const min = MIN_ROLE[r.function];
  if (min && RANK[m!.role]! < RANK[min]!) return { allowed: false, code: "FORBIDDEN", reason: `This needs the ${min} role in this workspace (you are ${m!.role}).` };
  if (!t!.channelId) return true;
  const channel = (await r.db.get(channels, t!.channelId))!;
  const [member] = await r.db.find(channelMembers, { channelId: channel.id, participantId: me!.id });
  const openToRole = channel.kind === "public" && m!.role !== "guest" && m!.role !== "agent";
  if (!member && !openToRole) hidden();
  if (r.kind === "mutation" && !member && !NON_MEMBER_WRITES.has(r.function)) {
    return { allowed: false, code: "FORBIDDEN", reason: "Join the channel to post in it." };
  }
  return true;
};
