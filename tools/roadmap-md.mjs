// Renders FELTKIT_PLATFORM_ROADMAP.md from feltkit-gaps.json (`roadmap` + gap statuses). Run: node tools/roadmap-md.mjs
import { readFileSync, writeFileSync } from "node:fs";
const reg = JSON.parse(readFileSync(new URL("../feltkit-gaps.json", import.meta.url)));
const gaps = Object.fromEntries(reg.gaps.map((g) => [g.id, g]));
const rm = reg.roadmap;
const md = ["# FeltKit platform roadmap", "", "> Generated from `feltkit-gaps.json` by `node tools/roadmap-md.mjs`. Edit the JSON, not this file.", ""];
md.push(`Updated ${rm.updated}. Evidence: [FELTKIT_GAP_REGISTER.md](FELTKIT_GAP_REGISTER.md) and [FELTKIT_MULTIPLAYER_BUILD_REPORT.md](FELTKIT_MULTIPLAYER_BUILD_REPORT.md).`, "");
md.push("Ranking criteria, in order: " + rm.criteria.map((c, i) => `${i + 1}. ${c}`).join("; ") + ".", "");
md.push("Each change lives with the component that owns the concept (FeltKit composes; AppPort, AppPort Services, FeltDB, AuthBoundry and AppBoundry own their primitives).", "");
for (const tier of rm.tiers) {
  md.push(`## ${tier.name}`, "", "| Gaps | Change | Owner | State | Gap status |", "|---|---|---|---|---|");
  for (const item of tier.items) md.push(`| ${item.gaps.map((id) => `[${id}](FELTKIT_GAP_REGISTER.md#${id.toLowerCase()})`).join(", ")} | ${item.change} | ${item.owner} | ${item.state} | ${item.gaps.map((id) => gaps[id]?.status ?? "?").join("; ")} |`);
  md.push("");
}
const covered = new Set(rm.tiers.flatMap((t) => t.items.flatMap((i) => i.gaps)));
const left = reg.gaps.filter((g) => !covered.has(g.id));
if (left.length) md.push("## Recorded, not planned", "", ...left.map((g) => `- **${g.id}** ${g.title} — ${g.status}`), "");
writeFileSync(new URL("../FELTKIT_PLATFORM_ROADMAP.md", import.meta.url), md.join("\n"));
console.log(`FELTKIT_PLATFORM_ROADMAP.md: ${rm.tiers.length} tiers, ${covered.size} gaps planned, ${left.length} recorded only`);
