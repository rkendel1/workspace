// Reproducible code measurement for the Multiplayer build report.
//   node tools/measure.mjs [--json]
// Counts source lines with cloc (code lines: no blanks, no comments). Every tracked file in multiplayer/
// is assigned to exactly one category below; an unassigned file fails the run, so nothing is silently
// left out. Excluded by construction: node_modules, build output (dist/, .feltkit/, multiplayer.app),
// lockfiles, binary assets. CLOC defaults to the cloc on PATH; set CLOC=/path/to/cloc otherwise.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../multiplayer/", import.meta.url).pathname;
const CLOC = process.env.CLOC ?? "cloc";
const BASELINE = "f926ad5"; // unmodified create-feltkit 0.3.15 scaffold commit

const CATEGORIES = {
  "Custom application code": ["feltkit/workspaces.ts", "feltkit/channels.ts", "feltkit/messages.ts", "feltkit/invitations.ts", "feltkit/attachments.ts", "feltkit/agents.ts", "feltkit/activity.ts", "feltkit/me.ts", "feltkit/demo.ts", "feltkit/_ops.ts", "feltkit/_util.ts", "agent/compose.ts", "src/App.tsx", "src/Onboarding.tsx", "src/Workspace.tsx", "src/ui.tsx", "src/styles.css"],
  "Custom data-model code": ["@app.ts:model"],
  "Custom authorization code": ["feltkit/_authz.ts"],
  "Custom real-time code": ["feltkit/presence.ts"],
  "Custom integration code": ["agent/worker.ts", "agent/room-agent.ts", "feltkit/_base64.ts", "deploy/verify-appboundry.sh", "deploy/check-persisted.ts"],
  "Configuration": ["@app.ts:config", "package.json", "tsconfig.json", "vite.config.ts", "index.html", ".gitignore"],
  "Tests": ["tests/helpers.ts", "tests/functional.test.ts", "tests/security.test.ts", "e2e/multiplayer.e2e.cjs", "e2e/deployment.e2e.cjs"],
  "Generated code": ["feltkit/_generated/api.ts"],
  "Starter code kept (create-feltkit)": ["src/auth.tsx", "src/theme.tsx", "src/main.tsx", "feltkit/inbox.ts", "public/theme.js"],
};
const IGNORED = ["package-lock.json", "README.md", "public/apple-touch-icon.png", "public/favicon.png", "public/feltkit-mark.png"];

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
const assigned = new Set([...Object.values(CATEGORIES).flat().filter((f) => !f.startsWith("@")), "feltkit/app.ts", ...IGNORED]);
const unassigned = tracked.filter((f) => !assigned.has(f));
if (unassigned.length) { console.error("Unassigned files:", unassigned); process.exit(1); }

// feltkit/app.ts holds the feltkit({...}) configuration and the collections (the data model): split at the first collection.
const tmp = mkdtempSync(join(tmpdir(), "measure-"));
const app = readFileSync(join(ROOT, "feltkit/app.ts"), "utf8");
const cut = app.indexOf("// ── Identity");
writeFileSync(join(tmp, "app.config.ts"), app.slice(0, cut));
writeFileSync(join(tmp, "app.model.ts"), app.slice(cut));
const resolve = (f) => (f === "@app.ts:config" ? join(tmp, "app.config.ts") : f === "@app.ts:model" ? join(tmp, "app.model.ts") : join(ROOT, f));

function cloc(paths) {
  const out = JSON.parse(execFileSync(CLOC, ["--json", "--quiet", "--skip-uniqueness", "--force-lang-def=/dev/null", ...paths].filter((a) => !a.startsWith("--force")), { encoding: "utf8" }) || "{}");
  const s = out.SUM ?? { code: 0, comment: 0, blank: 0, nFiles: 0 };
  return { files: s.nFiles, code: s.code, comment: s.comment, blank: s.blank };
}

const rows = {};
for (const [name, files] of Object.entries(CATEGORIES)) rows[name] = cloc(files.map(resolve));

// Authorization call sites inside handlers (application policy applied per function; FK-GAP-001).
const handlerFiles = CATEGORIES["Custom application code"].filter((f) => f.startsWith("feltkit/")).concat(["feltkit/presence.ts"]);
let authzCalls = 0;
for (const f of handlerFiles) authzCalls += (readFileSync(join(ROOT, f), "utf8").match(/\b(loadWorkspace|loadChannel|readableChannels|myRequest)\(ctx/g) ?? []).length;

// Client-side real-time code inside the UI (presence heartbeat and typing), counted by marker lines.
const ws = readFileSync(join(ROOT, "src/Workspace.tsx"), "utf8").split("\n");
const rtClient = ws.filter((l) => /heartbeat|typingIn|typingUntil|onTyping|lastTyping|ONLINE_MS|skew/.test(l)).length;

// Counts of things the report cites.

const testCount = (f) => (readFileSync(join(ROOT, f), "utf8").match(/^test\(/gm) ?? []).length;
const unitTests = ["tests/functional.test.ts", "tests/security.test.ts"].reduce((n, f) => n + testCount(f), 0);
const e2eChecks = ["e2e/multiplayer.e2e.cjs", "e2e/deployment.e2e.cjs"].reduce((n, f) => n + (readFileSync(join(ROOT, f), "utf8").match(/await check\("/g) ?? []).length, 0);

// What the starter already provided (baseline commit), and what of it was removed.
const baselineFiles = execFileSync("git", ["ls-tree", "-r", "--full-tree", "--name-only", BASELINE], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter((f) => f.startsWith("multiplayer/")).map((f) => f.replace(/^multiplayer\//, ""));
const baseDir = mkdtempSync(join(tmpdir(), "baseline-"));
for (const f of baselineFiles.filter((f) => /\.(ts|tsx|css|js|json|html)$/.test(f) && !f.endsWith("package-lock.json"))) {
  const dest = join(baseDir, f.replace(/\//g, "__"));
  writeFileSync(dest, execFileSync("git", ["show", `${BASELINE}:multiplayer/${f}`], { cwd: ROOT }));
}
const starter = cloc(execFileSync("ls", [baseDir], { encoding: "utf8" }).trim().split("\n").map((f) => join(baseDir, f)));

// Framework code reused (not written here): the platform sources this app runs on, when checked out.
const framework = {};
for (const [label, dir] of [["FeltKit SDK (packages/sdk/src)", "/home/user/feltkit/packages/sdk/src"], ["FeltKit Studio dashboard (packages/sdk/dashboard/src)", "/home/user/feltkit/packages/sdk/dashboard/src"], ["AppPort Services (src)", "/home/user/rkendel1/appport-services/src"], ["AppBoundry host (packages/appboundry-host/src)", "/home/user/appboundry/packages/appboundry-host/src"]]) {
  if (existsSync(dir)) framework[label] = cloc([dir]);
}

const custom = ["Custom application code", "Custom data-model code", "Custom authorization code", "Custom real-time code", "Custom integration code"].reduce((n, k) => n + rows[k].code, 0);
const result = { measuredAt: new Date().toISOString(), tool: execFileSync(CLOC, ["--version"], { encoding: "utf8" }).trim(), commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), categories: rows, customTotal: custom, appCodeShareOfCustom: +(rows["Custom application code"].code / custom * 100).toFixed(1), authzCallSites: authzCalls, realtimeClientLines: rtClient, unitTests, e2eChecks, starterBaseline: starter, framework };
if (process.argv.includes("--json")) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
console.log(`cloc ${result.tool} · commit ${result.commit}\n`);
console.log("Category".padEnd(40), "files".padStart(6), "code".padStart(7), "comment".padStart(8));
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(40), String(v.files).padStart(6), String(v.code).padStart(7), String(v.comment).padStart(8));
console.log("\nCustom total (app + model + authz + realtime + integration):", custom, "code lines");
console.log("Custom application code share of custom:", result.appCodeShareOfCustom + "%");
console.log("Context-loader call sites in handlers (enforcement is in authorize):", authzCalls, " · client real-time lines in Workspace.tsx:", rtClient);
console.log("Tests:", unitTests, "unit/integration tests,", e2eChecks, "browser e2e checks");
console.log("Starter baseline (create-feltkit, commit", BASELINE + "):", starter.code, "code lines in", starter.files, "files");
for (const [k, v] of Object.entries(framework)) console.log("Framework reused:", k, v.code, "code lines,", v.files, "files");
