// Scratch copy only: invitation codes become ctx.crypto.token() values (FK-GAP-010) instead of record ids.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const edit = (file, pairs) => {
  const p = join(dir, file);
  let s = readFileSync(p, "utf8");
  for (const [from, to] of pairs) { if (!s.includes(from)) throw new Error(`${file}: missing ${JSON.stringify(from.slice(0, 60))}`); s = s.replace(from, to); }
  writeFileSync(p, s);
};
edit("feltkit/app.ts", [
  ['  role: s.enum(["admin", "member", "guest"]),\n  note:', '  /** The bearer code in the link: 32 random bytes (ctx.crypto.token), never the record id. */\n  code: s.string({ minLength: 40 }),\n  role: s.enum(["admin", "member", "guest"]),\n  note:'],
  ['}, { indexes: [{ fields: ["workspaceId"] }] });\n\n// ── Conversations', '}, { unique: [["code"]], indexes: [{ fields: ["workspaceId"] }] });\n\n// ── Conversations'],
]);
edit("feltkit/invitations.ts", [
  ['    const id = await ctx.db.insert(invitations, { workspaceId, role,', '    const code = await ctx.crypto.token();\n    const id = await ctx.db.insert(invitations, { workspaceId, code, role,'],
  ['    return { id, expiresAt: now + WEEK };', '    return { id: code, expiresAt: now + WEEK };'],
  ['    const inv = await ctx.db.get(invitations, code);\n    if (!inv || inv.status !== "open" || inv.expiresAt < Date.now()) return null;', '    const [inv] = await ctx.db.find(invitations, { code });\n    if (!inv || inv.status !== "open" || inv.expiresAt < Date.now()) return null;'],
  ['    const inv = await ctx.db.get(invitations, code);\n    if (!inv || inv.status !== "open" || inv.expiresAt < Date.now()) fail("NOT_FOUND", "This invitation is invalid, used or expired.");', '    const [inv] = await ctx.db.find(invitations, { code });\n    if (!inv || inv.status !== "open" || inv.expiresAt < Date.now()) fail("NOT_FOUND", "This invitation is invalid, used or expired.");'],
  ['    await ctx.db.patch(invitations, code, { status: "accepted"', '    await ctx.db.patch(invitations, inv.id, { status: "accepted"'],
  ['idempotencyKey: `invitation:${code}` });', 'idempotencyKey: `invitation:${inv.id}` });'],
]);
// Revoke takes the record id from the list; the tests revoke with what create returned (now the code).
edit("feltkit/invitations.ts", [
  ['    const inv = await ctx.db.get(invitations, invitationId);\n    if (!inv) fail("NOT_FOUND", "Invitation not found.");', '    const inv = (await ctx.db.get(invitations, invitationId)) ?? (await ctx.db.find(invitations, { code: invitationId }))[0];\n    if (!inv) fail("NOT_FOUND", "Invitation not found.");'],
  ['    await ctx.db.patch(invitations, invitationId, { status: "revoked" });', '    await ctx.db.patch(invitations, inv.id, { status: "revoked" });'],
]);
