/**
 * Multiplayer: a workspace where people and agents talk, share files and produce work together.
 *
 * Workspaces are FeltKit tenants (`auth.tenant`): FeltKit owns workspaces, memberships, roles,
 * invitations and switching, and resolves the session's workspace and the caller's role there from
 * the live membership on every request. Authority has two layers, both enforced by FeltKit for every
 * call on every interface:
 *   1. Roles (below) grant AppPort permissions. A workspace role (owner, admin, member, guest, agent)
 *      is held only in a session working in that workspace; an account alone holds "person" (nothing).
 *   2. `authorize` (feltkit/_authz.ts) keeps the application's own conversation policy: private
 *      channels, direct messages, the agent's queue. Workspace data collections are tenant-scoped, so
 *      another workspace's records do not exist for a call.
 *
 * Presence and typing are short-lived, bounded state: one overwritten record per participant per
 * workspace (see presence.ts and the build report for why).
 */
import { feltkit, s } from "@feltdb/feltkit";
import { authorize } from "./_authz.js";

const PERSON = ["channels.*", "messages.*", "presence.*", "plans.read", "agents.request", "files.*", "notifications.*", "activity.read", "workspaces.*"];

export const app = feltkit({
  name: "multiplayer",
  description: "Multiplayer: real-time workspaces for people and agents.",
  roles: {
    // Every account: its profile and notifications, nothing in any workspace until it works in one.
    person: ["notifications.*"],
    // Workspace roles (auth.tenant.roles), held only in a session working in that workspace.
    owner: [...PERSON, "tenant.*"],
    admin: [...PERSON, "tenant.members.manage"],
    member: PERSON,
    guest: PERSON,
    // A room agent. It reads only channels it was added to and writes only through agent.*
    // capabilities and messages.write; the channel policy in feltkit/_authz.ts applies to it too.
    agent: ["agents.work", "messages.read", "messages.write", "plans.read", "plans.write", "presence.write", "notifications.send"],
    // Operating the deployment (Studio, credentials, jobs). Not a workspace role.
    operator: ["intelligence.*", "credential.*", "configuration.*", "apikeys.*", "webhooks.*", "jobs.*", "schedules.*", "feltkit.operations.*"],
  },
  auth: {
    accounts: { roles: ["person"], password: true, magicLink: true, email: { from: "auth@multiplayer.example" } },
    tenant: { name: "workspace", roles: ["owner", "admin", "member", "guest", "agent"] },
  },
  // Conversation policy: one function for every call (feltkit/_authz.ts).
  authorize,
  dev: {
    users: [
      { id: "ada", name: "Ada Lovelace", roles: ["person", "operator"] },
      { id: "grace", name: "Grace Hopper", roles: ["person"] },
      { id: "alan", name: "Alan Turing", roles: ["person"] },
      // The room agent's identity in development, so an owner can add it to a workspace (an operator
      // issues it a session in production: feltkit session create --id assistant --type agent --role agent).
      { id: "assistant", name: "Assistant", type: "agent", roles: ["agent"] },
    ],
  },
  services: {
    files: true,
    notifications: { types: ["mention", "agent.replied"] },
  },
});

// ── Identity ────────────────────────────────────────────────────────────────

/** Anyone or anything that can take part: a person, or an agent. One per principal. */
export const participants = app.collection("participants", {
  /** The FeltKit principal this participant acts as. Sample personas have "persona:<handle>". */
  principalId: s.string({ minLength: 1 }),
  kind: s.enum(["human", "agent"]),
  /** For agents: who it works for. */
  agentType: s.optional(s.enum(["personal", "workspace", "application"])),
  /** For personal agents: the participant that owns it. */
  ownerId: s.optional(s.string()),
  handle: s.string({ minLength: 1, maxLength: 32 }),
  displayName: s.string({ minLength: 1, maxLength: 80 }),
  title: s.optional(s.string({ maxLength: 80 })),
  persona: s.optional(s.boolean()),
  createdAt: s.number(),
}, { unique: [["principalId"], ["handle"]] });

// ── Workspace directory ─────────────────────────────────────────────────────

export const ROLES = ["owner", "admin", "member", "guest", "agent"] as const;
export type WorkspaceRole = (typeof ROLES)[number];

/** Workspace-scoped data: FeltKit stamps the session's workspace into workspaceId and filters every read and write by it. */
const WS = { tenant: { field: "workspaceId" } } as const;

/**
 * Who has a profile in this workspace: the directory that mentions, direct messages, channel
 * invitations and presence choose from. Not authority: FeltKit's membership decides who may work in
 * the workspace. A person is listed when they first work in it (me:ensure); sample personas and the
 * room agent are listed by the functions that bring them in.
 */
export const roster = app.collection("roster", {
  workspaceId: s.string(),
  participantId: s.ref(participants),
  joinedAt: s.number(),
}, { ...WS, unique: [["workspaceId", "participantId"]] });

// ── Conversations ───────────────────────────────────────────────────────────

/** Channels, direct messages and group conversations are all conversations. */
export const channels = app.collection("channels", {
  workspaceId: s.string(),
  kind: s.enum(["public", "private", "dm", "group"]),
  name: s.string({ minLength: 1, maxLength: 80 }),
  topic: s.optional(s.string({ maxLength: 250 })),
  /** dm/group: the sorted participant ids, so one conversation exists per set of people. */
  dmKey: s.optional(s.string()),
  createdBy: s.string(),
  createdAt: s.number(),
  isDefault: s.optional(s.boolean()),
}, { ...WS, unique: [{ fields: ["workspaceId", "dmKey"], sparse: true }], indexes: [{ fields: ["workspaceId"] }] });

export const channelMembers = app.collection("channelMembers", {
  workspaceId: s.string(),
  channelId: s.ref(channels),
  participantId: s.ref(participants),
  /** The highest message seq this member has read. Unread = top-level messages above it. */
  lastReadSeq: s.number(),
  joinedAt: s.number(),
}, { ...WS, unique: [["channelId", "participantId"]], indexes: [{ fields: ["participantId", "workspaceId"] }, { fields: ["channelId"] }] });

const AttachmentRef = s.object({ id: s.string(), name: s.string(), size: s.number(), contentType: s.string() });

export const messages = app.collection("messages", {
  workspaceId: s.string(),
  channelId: s.ref(channels),
  /** Order within the conversation, from ctx.db.sequence("msg:<channelId>"): no gaps, commit order. */
  seq: s.number(),
  authorId: s.ref(participants),
  text: s.string({ maxLength: 8000 }),
  /** Thread replies point at their root message. */
  rootId: s.optional(s.string()),
  topLevel: s.boolean(),
  replyCount: s.number(),
  lastReplyAt: s.optional(s.number()),
  mentions: s.array(s.string()),
  attachments: s.array(AttachmentRef),
  sharedObjectId: s.optional(s.string()),
  createdAt: s.number(),
  editedAt: s.optional(s.number()),
  deletedAt: s.optional(s.number()),
}, { ...WS, indexes: [{ fields: ["channelId", "seq"] }, { fields: ["rootId"] }, { fields: ["workspaceId"] }] });

export const reactions = app.collection("reactions", {
  workspaceId: s.string(),
  channelId: s.ref(channels),
  messageId: s.ref(messages),
  participantId: s.ref(participants),
  emoji: s.string({ minLength: 1, maxLength: 16 }),
  createdAt: s.number(),
}, { ...WS, unique: [["messageId", "participantId", "emoji"]], indexes: [{ fields: ["channelId"] }] });

/**
 * The binding of a stored file (AppPort Services Files owns the bytes and checksum) to the
 * conversation it was shared in, which is what authorizes reading it. Not a copy of the file.
 */
export const attachments = app.collection("attachments", {
  workspaceId: s.string(),
  channelId: s.ref(channels),
  fileId: s.string(),
  uploaderId: s.ref(participants),
  name: s.string(),
  size: s.number(),
  contentType: s.string(),
  messageId: s.optional(s.string()),
  createdAt: s.number(),
}, { ...WS, unique: [["fileId"]], indexes: [{ fields: ["channelId"] }] });

// ── Ephemeral (bounded) ─────────────────────────────────────────────────────

export const presence = app.collection("presence", {
  workspaceId: s.string(),
  participantId: s.ref(participants),
  lastSeenAt: s.number(),
  status: s.enum(["active", "away"]),
  typingIn: s.optional(s.string()),
  typingUntil: s.optional(s.number()),
}, { ...WS, unique: [["workspaceId", "participantId"]] });

// ── Agents and the work they produce ────────────────────────────────────────

/** A person asked an agent to do something. The agent works its queue under its own identity. */
export const agentRequests = app.collection("agentRequests", {
  workspaceId: s.string(),
  channelId: s.ref(channels),
  messageId: s.ref(messages),
  agentId: s.ref(participants),
  requestedBy: s.ref(participants),
  prompt: s.string({ maxLength: 8000 }),
  status: s.enum(["pending", "working", "done", "failed"]),
  createdAt: s.number(),
  claimedAt: s.optional(s.number()),
  finishedAt: s.optional(s.number()),
  replyId: s.optional(s.string()),
  sharedObjectId: s.optional(s.string()),
  error: s.optional(s.string({ maxLength: 500 })),
}, { ...WS, indexes: [{ fields: ["agentId", "status"] }] });

const PlanItem = s.object({ title: s.string(), owner: s.optional(s.string()), due: s.optional(s.string()), sourceMessageId: s.optional(s.string()) });

/** Structured objects produced in a conversation (today: project plans). */
export const sharedObjects = app.collection("sharedObjects", {
  workspaceId: s.string(),
  channelId: s.ref(channels),
  kind: s.enum(["project_plan"]),
  title: s.string({ minLength: 1, maxLength: 160 }),
  summary: s.string({ maxLength: 4000 }),
  goals: s.array(s.string()),
  tasks: s.array(PlanItem),
  decisions: s.array(s.string()),
  risks: s.array(s.string()),
  openQuestions: s.array(s.string()),
  sourceMessageIds: s.array(s.string()),
  createdBy: s.ref(participants),
  requestedBy: s.optional(s.string()),
  createdAt: s.number(),
}, { ...WS, indexes: [{ fields: ["workspaceId"] }] });

/** An auditable record of meaningful changes in a workspace (not every message). */
export const activity = app.collection("activity", {
  workspaceId: s.string(),
  actorId: s.string(),
  type: s.string(),
  summary: s.string({ maxLength: 300 }),
  subjectId: s.optional(s.string()),
  at: s.number(),
}, { ...WS, indexes: [{ fields: ["workspaceId", "at"] }] });
