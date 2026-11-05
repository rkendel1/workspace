// Edits the scratch copy only: wire the hook in, and make _authz.ts's helpers non-enforcing loaders.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const edit = (file, pairs) => {
  const p = join(dir, file);
  let s = readFileSync(p, "utf8");
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw new Error(`${file}: expected to find ${JSON.stringify(from.slice(0, 60))}`);
    s = s.replace(from, to);
  }
  writeFileSync(p, s);
};
edit("feltkit/app.ts", [
  ['import { feltkit, s } from "@feltdb/feltkit";', 'import { feltkit, s } from "@feltdb/feltkit";\nimport { authorize } from "./_policy.js";'],
  ['  auth: { accounts: { roles: ["member"] } },', '  auth: { accounts: { roles: ["member"] } },\n  authorize,'],
]);
edit("feltkit/_authz.ts", [
  // requireWorkspace: load only.
  ['  if (!m) fail("NOT_FOUND", "Workspace not found.");\n  if (RANK[m.role as WorkspaceRole] < RANK[minRole]) fail("FORBIDDEN", `This needs the ${minRole} role in this workspace (you are ${m.role}).`);\n', ''],
  // requireChannel: load only.
  ['  if (!m) fail("NOT_FOUND", "Conversation not found.");\n', ''],
  ['  const openToRole = channel.kind === "public" && m.role !== "guest" && m.role !== "agent";\n  if (!member && !openToRole) fail("NOT_FOUND", "Conversation not found.");\n  if (opts.write && !member) fail("FORBIDDEN", "Join the channel to post in it.");\n', ''],
]);
