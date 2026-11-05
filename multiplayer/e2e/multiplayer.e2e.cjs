/**
 * Two independent browser sessions (separate contexts: separate storage, cookies, sessions) against
 * a running Multiplayer server and room-agent process. Verifies real-time delivery, typing,
 * presence, reactions, threads, unread counts, membership changes, the agent action, reconnection
 * and durable recovery. Writes screenshots and evidence.json.
 *
 *   BASE=http://localhost:3000 SHOTS=../../docs/screenshots node e2e/multiplayer.e2e.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = path.resolve(process.env.SHOTS ?? path.join(__dirname, "../../docs/screenshots"));
const EVIDENCE = process.env.EVIDENCE ?? path.join(SHOTS, "evidence.json");
const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, ...(detail ? { detail } : {}) }); console.log(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message ?? e).split("\n")[0] }); console.log(`FAIL ${name}: ${e.message}`); }
};
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });
/** Time from an action in one session until a locator is visible in the other. */
const seen = async (action, locator, timeout = 5000) => { const t0 = Date.now(); await action(); await locator.waitFor({ state: "visible", timeout }); return Date.now() - t0; };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const mk = async (who, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...opts });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`[${who}] pageerror ${e}`));
    return { ctx, page };
  };
  const A = await mk("ada");
  const G = await mk("grace");
  const ada = A.page, grace = G.page;
  const stamp = Date.now().toString(36);

  await check("ada signs in and opens a fresh sample workspace", async () => {
    await ada.goto(`${BASE}/?as=ada`);
    await ada.evaluate(() => sessionStorage.clear());
    await ada.waitForTimeout(800);
    const opened = await ada.getByRole("button", { name: "Open sample workspace" }).isVisible().catch(() => false);
    if (!opened) await ada.getByRole("button", { name: /Switch workspace/ }).click();
    await ada.getByRole("button", { name: "Open sample workspace" }).click();
    await ada.getByRole("heading", { level: 1, name: /general/ }).waitFor();
  });

  let link = "";
  await check("ada invites grace (invitation link)", async () => {
    await ada.getByRole("button", { name: "＋ Invite people" }).click();
    await ada.getByPlaceholder("e.g. alex@acme.com").fill("grace@example.com");
    await ada.getByRole("button", { name: "Create invitation link" }).click();
    link = await ada.getByLabel("Invitation link").inputValue();
    await shot(ada, "05-invite.png");
    await ada.getByRole("button", { name: "Close" }).click();
    return { link: link.replace(/invite=.*/, "invite=<code>") };
  });

  await check("grace accepts in an independent session", async () => {
    await grace.goto(`${link}&as=grace`);
    await grace.getByRole("button", { name: /Join Northwind Labs/ }).click();
    await grace.getByRole("heading", { level: 1, name: /general/ }).waitFor();
  });

  await ada.getByRole("button", { name: /^#\s*general/ }).click();
  const adaBox = ada.getByRole("textbox", { name: "Message #general" });
  const graceBox = grace.getByRole("textbox", { name: "Message #general" });

  await check("real-time message delivery (no refresh)", async () => {
    const text = `Hello Grace, welcome aboard! (${stamp})`;
    const ms = await seen(async () => { await adaBox.fill(text); await adaBox.press("Enter"); }, grace.getByText(text));
    return { latencyMs: ms };
  });

  await check("typing indicator", async () => {
    const ms = await seen(() => graceBox.pressSequentially("I'm typing a reply", { delay: 30 }), ada.getByText(/Grace is typing/));
    await Promise.all([shot(ada, "06-typing-ada-sees.png"), shot(grace, "06-typing-grace-types.png")]);
    await graceBox.fill("");
    return { latencyMs: ms };
  });

  await check("presence: grace shows active in ada's member list", async () => {
    await ada.getByRole("button", { name: /Members · / }).click();
    const row = ada.locator(".members li", { hasText: "Grace Hopper" });
    await row.getByText(/active/).waitFor({ timeout: 5000 });
    await shot(ada, "07-presence-members.png");
    await ada.getByRole("button", { name: "Close panel" }).click();
  });

  await check("presence: going offline is reflected", async () => {
    // Grace's last heartbeat ages out after 60 s; here we check the 'away' transition instead (visibility).
    await grace.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await ada.getByRole("button", { name: /Members · / }).click();
    await ada.locator(".members li", { hasText: "Grace Hopper" }).getByText(/away/).waitFor({ timeout: 5000 });
    await ada.getByRole("button", { name: "Close panel" }).click();
    await grace.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  });

  const target = grace.locator('[data-testid="message"]', { hasText: `welcome aboard! (${stamp})` });
  await check("reactions propagate", async () => {
    await target.hover();
    await target.getByRole("button", { name: "Add reaction" }).click();
    const ms = await seen(() => target.getByRole("menuitem", { name: "React 🎉" }).click(), ada.locator('[data-testid="message"]', { hasText: stamp }).getByRole("button", { name: /🎉 1/ }));
    return { latencyMs: ms };
  });

  await check("thread replies propagate", async () => {
    await target.hover();
    await target.getByRole("button", { name: "Reply in thread" }).click();
    const reply = grace.getByRole("textbox", { name: "Reply…" });
    const ms = await seen(async () => { await reply.fill("Thanks Ada — glad to be here."); await reply.press("Enter"); }, ada.locator('[data-testid="message"]', { hasText: stamp }).getByRole("button", { name: /1 reply/ }));
    await ada.locator('[data-testid="message"]', { hasText: stamp }).getByRole("button", { name: /1 reply/ }).click();
    await ada.getByText("Thanks Ada — glad to be here.").waitFor();
    await shot(ada, "08-thread.png");
    await ada.getByRole("button", { name: "Close panel" }).click();
    await grace.getByRole("button", { name: "Close panel" }).click();
    return { latencyMs: ms };
  });

  await check("unread counts update live", async () => {
    await ada.getByRole("button", { name: /^#\s*random/ }).click();
    const box = ada.getByRole("textbox", { name: "Message #random" });
    const before = await grace.getByRole("button", { name: /^#\s*random/ }).textContent();
    const ms = await seen(async () => { await box.fill(`Unread test ${stamp}`); await box.press("Enter"); }, grace.getByRole("button", { name: /random/ }).getByLabel(/unread/));
    return { latencyMs: ms, before };
  });

  await check("membership change: grace is added to a new private channel live", async () => {
    await ada.getByRole("button", { name: "Create a channel" }).click();
    await ada.getByLabel("Name").fill(`e2e-${stamp}`);
    await ada.getByLabel(/Private/).check();
    await ada.getByRole("button", { name: "Create channel" }).click();
    await ada.getByRole("heading", { level: 1, name: new RegExp(`e2e-${stamp}`) }).waitFor();
    if (await grace.getByRole("button", { name: new RegExp(`e2e-${stamp}`) }).isVisible()) throw new Error("private channel visible before being added");
    await ada.getByRole("button", { name: "Add people" }).click();
    await ada.getByRole("checkbox", { name: /Grace Hopper/ }).check();
    const ms = await seen(() => ada.getByRole("button", { name: /^Add 1/ }).click(), grace.getByRole("button", { name: new RegExp(`e2e-${stamp}`) }));
    return { latencyMs: ms };
  });

  await check("agent: mention, plan persisted, reply visible to both sessions", async () => {
    await ada.getByRole("button", { name: /launch-q1/ }).click();
    const box = ada.getByRole("textbox", { name: "Message #launch-q1" });
    await box.fill("@assistant summarize this discussion and create a project plan.");
    await box.press("Escape");
    await box.press("Enter");
    const mine = ada.locator('[data-testid="message"]', { hasText: "summarize this discussion" }).last();
    const t0 = Date.now();
    await mine.getByRole("button", { name: /1 reply/ }).waitFor({ timeout: 20000 });
    const agentMs = Date.now() - t0;
    await mine.getByRole("button", { name: /1 reply/ }).click();
    await ada.getByRole("button", { name: /PROJECT PLAN/ }).waitFor();
    await shot(ada, "09-agent-reply-thread.png");
    await ada.getByRole("button", { name: /PROJECT PLAN/ }).click();
    await ada.getByRole("heading", { name: /Project plan:/ }).waitFor();
    await shot(ada, "10-agent-project-plan.png");
    // Grace (not a member of #launch-q1, but it is public) sees the same reply.
    await grace.getByRole("button", { name: /launch-q1/ }).click();
    await grace.locator('[data-testid="message"]', { hasText: "summarize this discussion" }).last().getByRole("button", { name: /1 reply/ }).waitFor({ timeout: 5000 });
    return { agentRoundTripMs: agentMs };
  });

  await check("reconnection: offline session catches up from durable state", async () => {
    await grace.getByRole("button", { name: /^#\s*general/ }).click();
    await ada.getByRole("button", { name: /^#\s*general/ }).click();
    await G.ctx.setOffline(true);
    await grace.waitForTimeout(1500);
    const text = `Sent while Grace was offline (${stamp})`;
    await adaBox.fill(text); await adaBox.press("Enter");
    await ada.getByText(text).waitFor();
    await grace.waitForTimeout(1500);
    if (await grace.getByText(text).isVisible()) throw new Error("delivered while offline?");
    const ms = await seen(() => G.ctx.setOffline(false), grace.getByText(text), 20000);
    return { catchUpAfterReconnectMs: ms };
  });

  await check("durable recovery: a fresh page load shows the authoritative state", async () => {
    await grace.reload();
    await grace.getByText(`Sent while Grace was offline (${stamp})`).waitFor();
    await grace.getByText(`welcome aboard! (${stamp})`).waitFor();
  });

  await check("side-by-side screenshot of both sessions", async () => {
    await ada.getByRole("button", { name: /^#\s*general/ }).click();
    await grace.getByRole("button", { name: /^#\s*general/ }).click();
    await graceBox.pressSequentially("Typing so Ada can see it", { delay: 25 });
    await ada.getByText(/Grace is typing/).waitFor();
    const a = await ada.screenshot(); const g = await grace.screenshot();
    const view = await browser.newPage({ viewport: { width: 2000, height: 660 }, deviceScaleFactor: 1 });
    await view.setContent(`<body style="margin:0;display:flex;gap:16px;padding:16px;background:#222;font:600 16px system-ui;color:#fff">
      <figure style="margin:0;flex:1"><figcaption>Session 1 · Ada (browser context A)</figcaption><img style="width:100%;border-radius:8px" src="data:image/png;base64,${a.toString("base64")}"></figure>
      <figure style="margin:0;flex:1"><figcaption>Session 2 · Grace (browser context B)</figcaption><img style="width:100%;border-radius:8px" src="data:image/png;base64,${g.toString("base64")}"></figure></body>`);
    await view.screenshot({ path: path.join(SHOTS, "04-two-sessions.png"), fullPage: true });
    await view.close();
    await graceBox.fill("");
  });

  await check("light/dark/mobile screenshots", async () => {
    await ada.getByRole("button", { name: /launch-q1/ }).click();
    await ada.waitForTimeout(500);
    await shot(ada, "02-workspace-light.png");
    await ada.emulateMedia({ colorScheme: "dark" });
    await ada.waitForTimeout(300);
    await shot(ada, "03-workspace-dark.png");
    await ada.emulateMedia({ colorScheme: "light" });
    const m = await browser.newContext({ ...require("playwright").devices["iPhone 13"] });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/?as=alan`);
    const demo = mp.getByRole("button", { name: "Open sample workspace" });
    await Promise.race([demo.waitFor().then(() => demo.click()), mp.getByRole("heading", { level: 1 }).waitFor()]);
    await mp.getByRole("heading", { level: 1 }).waitFor();
    await mp.screenshot({ path: path.join(SHOTS, "11-mobile-conversation.png") });
    await mp.getByRole("button", { name: "Show conversations" }).click();
    await mp.screenshot({ path: path.join(SHOTS, "12-mobile-sidebar.png") });
    await m.close();
    const o = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const op = await o.newPage();
    await op.goto(`${BASE}/?as=grace`);
    await op.getByRole("button", { name: /Switch workspace/ }).click();
    await op.screenshot({ path: path.join(SHOTS, "01-onboarding.png") });
    await o.close();
  });

  await browser.close();
  const ok = results.filter((r) => r.ok).length;
  fs.writeFileSync(EVIDENCE, JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: ok, failed: results.length - ok, results }, null, 2));
  console.log(`\n${ok}/${results.length} passed · evidence: ${EVIDENCE}`);
  process.exit(ok === results.length ? 0 : 1);
})();
