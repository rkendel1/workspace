/**
 * Deployment verification: the compiled artifact served by the published AppBoundry runtime
 * (production environment, operator-issued sessions), two independent browser sessions, the
 * room-agent process connected over HTTP, and a runtime restart on the same state.
 *
 *   BASE=http://127.0.0.1:4100 ADA_TOKEN=… GRACE_TOKEN=… node e2e/deployment.e2e.cjs
 */
// BLOCKED (FK-GAP-013): this checked the AppBoundry artifact with operator-issued sessions. Multiplayer
// now needs FeltKit accounts and tenancy and an app.agent, which AppBoundry hosts do not provide (the
// AppBoundry build refuses app.agent), so there is no artifact to check. Kept for when they do.
if (process.env.FORCE_BLOCKED !== "1") {
  console.error("deployment.e2e.cjs is blocked by FK-GAP-013 (no accounts/tenancy on AppBoundry; app.agent refused by the AppBoundry build).");
  process.exit(2);
}
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE;
const SHOTS = path.resolve(process.env.SHOTS ?? path.join(__dirname, "../../docs/screenshots"));
const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const d = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, ...(d ? { detail: d } : {}) }); console.log(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { results.push({ name, ok: false, error: String(e.message ?? e).split("\n")[0] }); console.log(`FAIL ${name}: ${String(e.message).split("\n")[0]}`); }
};
(async () => {
  const browser = await chromium.launch();
  const session = async (token) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("feltkit.session", t); sessionStorage.setItem("seeded", "1"); } }, token);
    const page = await ctx.newPage();
    return { ctx, page };
  };
  const stamp = Date.now().toString(36);
  await check("health: runtime reports ready with this build's module", async () => {
    const h = await (await fetch(`${BASE}/_appboundry/health`)).json();
    if (h.status !== "ready") throw new Error(JSON.stringify(h));
    return h;
  });
  await check("anonymous callers are refused", async () => {
    const r = await fetch(`${BASE}/api/session`); const s = await r.json();
    if (s.principal !== null) throw new Error("anonymous principal");
  });
  const A = await session(process.env.ADA_TOKEN), G = await session(process.env.GRACE_TOKEN);
  const ada = A.page, grace = G.page;
  let link = "";
  await check("ada (operator-issued session) creates the sample workspace", async () => {
    await ada.goto(BASE);
    const demo = ada.getByRole("button", { name: "Open sample workspace" });
    await Promise.race([demo.waitFor().then(() => demo.click()), ada.getByRole("heading", { level: 1 }).waitFor()]);
    await ada.getByRole("heading", { level: 1, name: /general/ }).waitFor();
    await ada.getByRole("button", { name: "＋ Invite people" }).click();
    await ada.getByRole("button", { name: "Create invitation link" }).click();
    link = await ada.getByLabel("Invitation link").inputValue();
    await ada.getByRole("button", { name: "Close" }).click();
  });
  await check("grace joins by invitation", async () => {
    await grace.goto(link);
    await grace.getByRole("button", { name: /Join Northwind Labs/ }).click();
    await grace.getByRole("heading", { level: 1, name: /general/ }).waitFor();
  });
  await check("real-time delivery on AppBoundry", async () => {
    const box = ada.getByRole("textbox", { name: "Message #general" });
    const text = `Hello from the artifact (${stamp})`;
    const t0 = Date.now(); await box.fill(text); await box.press("Enter");
    await grace.getByText(text).waitFor({ timeout: 8000 });
    return { latencyMs: Date.now() - t0 };
  });
  await check("typing indicator on AppBoundry", async () => {
    await grace.getByRole("textbox", { name: "Message #general" }).pressSequentially("typing…", { delay: 30 });
    await ada.getByText(/Grace is typing/).waitFor({ timeout: 8000 });
    await grace.getByRole("textbox", { name: "Message #general" }).fill("");
  });
  await check("file upload and authorized download on AppBoundry", async () => {
    const file = path.join(require("node:os").tmpdir(), `notes-${stamp}.txt`);
    fs.writeFileSync(file, `Launch notes ${stamp}`);
    await ada.locator('input[type="file"]').first().setInputFiles(file);
    await ada.locator(".pending-files").getByText(`notes-${stamp}.txt`).waitFor();
    const box = ada.getByRole("textbox", { name: "Message #general" });
    await box.fill("Notes attached"); await box.press("Enter");
    const chip = grace.getByRole("button", { name: new RegExp(`Download notes-${stamp}.txt`) });
    await chip.waitFor({ timeout: 8000 });
    const [dl] = await Promise.all([grace.waitForEvent("download"), chip.click()]);
    const body = fs.readFileSync(await dl.path(), "utf8");
    if (body !== `Launch notes ${stamp}`) throw new Error(`downloaded ${JSON.stringify(body)}`);
  });
  await check("agent process answers over HTTP with a persisted plan", async () => {
    await ada.getByRole("button", { name: /launch-q1/ }).click();
    const box = ada.getByRole("textbox", { name: "Message #launch-q1" });
    await box.fill("@assistant summarize this discussion and create a project plan.");
    await box.press("Escape"); await box.press("Enter");
    const mine = ada.locator('[data-testid="message"]', { hasText: "summarize this discussion" }).last();
    const t0 = Date.now();
    await mine.getByRole("button", { name: /1 reply/ }).waitFor({ timeout: 30000 });
    const ms = Date.now() - t0;
    await mine.getByRole("button", { name: /1 reply/ }).click();
    await ada.getByRole("button", { name: /PROJECT PLAN/ }).click();
    await ada.getByRole("heading", { name: /Project plan:/ }).waitFor();
    await ada.screenshot({ path: path.join(SHOTS, "13-appboundry-artifact-plan.png") });
    return { agentRoundTripMs: ms };
  });
  await A.ctx.close(); await G.ctx.close(); await browser.close();
  const ok = results.filter((r) => r.ok).length;
  fs.writeFileSync(process.env.EVIDENCE ?? path.join(SHOTS, "deployment-evidence.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: ok, failed: results.length - ok, results }, null, 2));
  console.log(`\n${ok}/${results.length} passed`);
  process.exit(ok === results.length ? 0 : 1);
})();
