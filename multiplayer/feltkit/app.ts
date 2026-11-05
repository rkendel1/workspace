/**
 * Multiplayer: a workspace where people and agents talk, share files and produce work together.
 *
 * Authority has two layers, both enforced by FeltKit for every call on every interface:
 *   1. Application roles (below) grant AppPort permissions: which functions a principal may call.
 *   2. `authorize` (feltkit/_authz.ts) decides which workspace and conversation records the caller
 *      may touch, from the validated arguments and the stored memberships. Handlers do not repeat it.
 *
 * Durable records (messages, memberships, plans, activity) live in this app's FeltDB instance.
 * Presence and typing are short-lived, bounded state: one overwritten record per participant per
 * workspace (see presence.ts and the build report for why).
 */
import { feltkit, s } from "@feltdb/feltkit";
import { authorize } from "./_authz.js";

const HUMAN = [
  "workspaces.*", "channels.*", "messages.*", "invitations.*", "presence.*",
  "plans.read", "agents.request", "files.*", "notifications.*", "activity.read",
];

export const app = feltkit({
  name: "multiplayer",
  description: "Multiplayer: real-time workspaces for people and agents.",
  roles: {
    member: HUMAN,
    // A room agent. It reads only channels it was added to and writes only through agent.*
    // capabilities and messages.write; membership checks in feltkit/_authz.ts apply to it too.
    agent: ["agents.work", "messages.read", "messages.write", "plans.read", "plans.write", "presence.write", "notifications.send"],
    admin: ["intelligence.*", "credential.*", "configuration.*", "apikeys.*", "webhooks.*", "jobs.*", "schedules.*", "feltkit.operations.*"],
  },
  auth: { accounts: { roles: ["member"] } },
  // Workspace and conversation membership: one policy for every function (feltkit/_authz.ts).
  authorize,
  dev: {
    users: [
      { id: "ada", name: "Ada Lovelace", roles: ["member", "admin"] },
      { id: "grace", name: "Grace Hopper", roles: ["member"] },
      { id: "alan", name: "Alan Turing", roles: ["member"] },
    ],
  },
  services: {
    files: true,
    notifications: { types: ["mention", "invitation.accepted", "agent.replied"] },
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

// ── Tenancy ─────────────────────────────────────────────────────────────────

export const workspaces = app.collection("workspaces", {
  name: s.string({ minLength: 1, maxLength: 60 }),
  description: s.optional(s.string({ maxLength: 280 })),
  createdBy: s.string(),
  createdAt: s.number(),
  demo: s.optional(s.boolean()),
});

export const ROLES = ["owner", "admin", "member", "guest", "agent"] as const;
export type WorkspaceRole = (typeof ROLES)[number];

/** Authoritative: who belongs to a workspace and with which role. */
export const memberships = app.collection("memberships", {
  workspaceId: s.ref(workspaces),
  participantId: s.ref(participants),
  role: s.enum([...ROLES]),
  joinedAt: s.number(),
  invitedBy: s.optional(s.string()),
}, { unique: [["workspaceId", "participantId"]], indexes: [{ fields: ["participantId"] }] });

export const invitations = app.collection("invitations", {
  workspaceId: s.ref(workspaces),
  /** The bearer code in the invitation link: 32 random bytes from ctx.crypto.token(), never the record id. */
  code: s.string({ minLength: 40 }),
  role: s.enum(["admin", "member", "guest"]),
  note: s.optional(s.string({ maxLength: 120 })),
  createdBy: s.string(),
  createdAt: s.number(),
  expiresAt: s.number(),
  status: s.enum(["open", "accepted", "revoked"]),
  acceptedBy: s.optional(s.string()),
  acceptedAt: s.optional(s.number()),
}, { unique: [["code"]], indexes: [{ fields: ["workspaceId"] }] });

// ── Conversations ───────────────────────────────────────────────────────────

/** Channels, direct messages and group conversations are all conversations. */
export const channels = app.collection("channels", {
  workspaceId: s.ref(workspaces),
  kind: s.enum(["public", "private", "dm", "group"]),
  name: s.string({ minLength: 1, maxLength: 80 }),
  topic: s.optional(s.string({ maxLength: 250 })),
  /** dm/group: the sorted participant ids, so one conversation exists per set of people. */
  dmKey: s.optional(s.string()),
  createdBy: s.string(),
  createdAt: s.number(),
  isDefault: s.optional(s.boolean()),
}, { unique: [{ fields: ["workspaceId", "dmKey"], sparse: true }], indexes: [{ fields: ["workspaceId"] }] });

export const channelMembers = app.collection("channelMembers", {
  workspaceId: s.ref(workspaces),
  channelId: s.ref(channels),
  participantId: s.ref(participants),
  /** The highest message seq this member has read. Unread = top-level messages above it. */
  lastReadSeq: s.number(),
  joinedAt: s.number(),
}, { unique: [["channelId", "participantId"]], indexes: [{ fields: ["participantId", "workspaceId"] }, { fields: ["channelId"] }] });

const AttachmentRef = s.object({ id: s.string(), name: s.string(), size: s.number(), contentType: s.string() });

export const messages = app.collection("messages", {
  workspaceId: s.ref(workspaces),
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
}, { indexes: [{ fields: ["channelId", "seq"] }, { fields: ["rootId"] }, { fields: ["workspaceId"] }] });

export const reactions = app.collection("reactions", {
  workspaceId: s.ref(workspaces),
  channelId: s.ref(channels),
  messageId: s.ref(messages),
  participantId: s.ref(participants),
  emoji: s.string({ minLength: 1, maxLength: 16 }),
  createdAt: s.number(),
}, { unique: [["messageId", "participantId", "emoji"]], indexes: [{ fields: ["channelId"] }] });

/**
 * The binding of a stored file (AppPort Services Files owns the bytes and checksum) to the
 * conversation it was shared in, which is what authorizes reading it. Not a copy of the file.
 */
export const attachments = app.collection("attachments", {
  workspaceId: s.ref(workspaces),
  channelId: s.ref(channels),
  fileId: s.string(),
  uploaderId: s.ref(participants),
  name: s.string(),
  size: s.number(),
  contentType: s.string(),
  messageId: s.optional(s.string()),
  createdAt: s.number(),
}, { unique: [["fileId"]], indexes: [{ fields: ["channelId"] }] });

// ── Ephemeral (bounded) ─────────────────────────────────────────────────────

export const presence = app.collection("presence", {
  workspaceId: s.ref(workspaces),
  participantId: s.ref(participants),
  lastSeenAt: s.number(),
  status: s.enum(["active", "away"]),
  typingIn: s.optional(s.string()),
  typingUntil: s.optional(s.number()),
}, { unique: [["workspaceId", "participantId"]] });

// ── Agents and the work they produce ────────────────────────────────────────

/** A person asked an agent to do something. The agent works its queue under its own identity. */
export const agentRequests = app.collection("agentRequests", {
  workspaceId: s.ref(workspaces),
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
}, { indexes: [{ fields: ["agentId", "status"] }] });

const PlanItem = s.object({ title: s.string(), owner: s.optional(s.string()), due: s.optional(s.string()), sourceMessageId: s.optional(s.string()) });

/** Structured objects produced in a conversation (today: project plans). */
export const sharedObjects = app.collection("sharedObjects", {
  workspaceId: s.ref(workspaces),
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
}, { indexes: [{ fields: ["workspaceId"] }] });

/** An auditable record of meaningful changes in a workspace (not every message). */
export const activity = app.collection("activity", {
  workspaceId: s.ref(workspaces),
  actorId: s.string(),
  type: s.string(),
  summary: s.string({ maxLength: 300 }),
  subjectId: s.optional(s.string()),
  at: s.number(),
}, { indexes: [{ fields: ["workspaceId", "at"] }] });
