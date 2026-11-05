/** After a runtime restart: Ada's workspace, the messages and the agent's plan are read back from durable state. */
import { createClient } from "@feltdb/feltkit/client";
import { api } from "../feltkit/_generated/api.js";
let token: string | null = process.env.ADA_TOKEN!;
const c = createClient({ url: process.env.BASE!, tokens: { get: () => token, set: (t) => { token = t; } } });
const me = await c.query(api.me.get);
const ws = me!.workspaces.find((w) => w.name === "Northwind Labs")!;
const plans = await c.query(api.agents.plans, { workspaceId: ws.id });
const general = (await c.query(api.channels.list, { workspaceId: ws.id })).find((x) => x.name === "general")!;
const { items } = await c.query(api.messages.list, { channelId: general.id });
const ok = plans.length >= 1 && items.some((m) => m.text.startsWith("Hello from the artifact")) && items.some((m) => m.attachments.length > 0);
console.log(JSON.stringify({ workspace: ws.name, plans: plans.length, generalMessages: items.length, withAttachment: items.filter((m) => m.attachments.length).length, ok }));
if (!ok) process.exit(1);
