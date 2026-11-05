import { fail, s } from "@feltdb/feltkit";
import { app, attachments } from "./app.js";
import { requireChannel } from "./_authz.js";
import { fromBase64, toBase64 } from "./_base64.js";

/**
 * Files: AppPort Services Files stores the bytes (with checksum and audit) in this app's FeltDB
 * instance. Files are application-shared there (FK-GAP-007), so the conversation a file was shared
 * in is recorded here and every read is authorized by membership of that conversation.
 * Bytes cross the function API as base64 because FeltKit has no file route (FK-GAP-007).
 */
export const upload = app.mutation({
  access: "files.write",
  args: { channelId: s.string(), name: s.string({ minLength: 1, maxLength: 200 }), contentType: s.optional(s.string({ maxLength: 120 })), base64: s.string({ maxLength: 1_500_000 }) },
  returns: s.object({ id: s.string(), name: s.string(), size: s.number(), contentType: s.string() }),
  handler: async (ctx, { channelId, name, contentType, base64 }) => {
    const { channel, participant } = await requireChannel(ctx, channelId, { write: true });
    const bytes = fromBase64(base64);
    const type = contentType || "application/octet-stream";
    const file = await ctx.services.files.upload({ name: name.trim(), contentType: type, content: bytes, metadata: { workspaceId: channel.workspaceId, channelId } });
    const id = await ctx.db.insert(attachments, { workspaceId: channel.workspaceId, channelId, fileId: file.id, uploaderId: participant.id, name: name.trim(), size: bytes.byteLength, contentType: type, createdAt: Date.now() });
    return { id, name: name.trim(), size: bytes.byteLength, contentType: type };
  },
});

export const download = app.query({
  access: "files.read",
  args: { attachmentId: s.string() },
  handler: async (ctx, { attachmentId }) => {
    const a = await ctx.db.get(attachments, attachmentId);
    if (!a) fail("NOT_FOUND", "File not found.");
    await requireChannel(ctx, a.channelId);
    const { bytes } = await ctx.services.files.read(a.fileId);
    return { name: a.name, contentType: a.contentType, size: a.size, base64: toBase64(bytes) };
  },
});

/** Files shared in a conversation (the right panel). */
export const list = app.query({
  access: "files.read",
  args: { channelId: s.string() },
  handler: async (ctx, { channelId }) => {
    await requireChannel(ctx, channelId);
    return (await ctx.db.find(attachments, { channelId }, { orderBy: [{ field: "createdAt", direction: "desc" }] }))
      .filter((a) => a.messageId)
      .map((a) => ({ id: a.id, name: a.name, size: a.size, contentType: a.contentType, messageId: a.messageId!, createdAt: a.createdAt }));
  },
});
