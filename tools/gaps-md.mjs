// Renders FELTKIT_GAP_REGISTER.md from feltkit-gaps.json (the single source). Run: node tools/gaps-md.mjs
import { readFileSync, writeFileSync } from "node:fs";
const reg = JSON.parse(readFileSync(new URL("../feltkit-gaps.json", import.meta.url)));
const md = [];
md.push("# FeltKit gap register", "", "> Generated from `feltkit-gaps.json` by `node tools/gaps-md.mjs`. Edit the JSON, not this file.", "");
md.push(`Project: ${reg.project}. Platform: ${Object.entries(reg.platformVersions).map(([k, v]) => `${k} ${v}`).join(", ")}.`, "");
md.push(`Platform source revisions read: ${Object.entries(reg.platformRevisions).map(([k, v]) => `${k}@${v}`).join(", ")}.`, "");
const by = (k) => reg.gaps.reduce((a, g) => ((a[g[k]] = (a[g[k]] ?? 0) + 1), a), {});
md.push(`**${reg.gaps.length} gaps.** By classification: ${Object.entries(by("category")).map(([k, v]) => `${k} ${v}`).join(", ")}. By priority: ${Object.entries(by("priority")).sort().map(([k, v]) => `${k} ${v}`).join(", ")}.`, "");
md.push("Classifications: " + reg.classifications.map((c) => "`" + c + "`").join(", ") + ". `application-specific` entries are recorded so they are *not* counted as platform overhead.", "");
md.push("| ID | Title | Classification | Layer | Severity | Priority | Owner | Status |", "|---|---|---|---|---|---|---|---|");
for (const g of reg.gaps) md.push(`| [${g.id}](#${g.id.toLowerCase()}) | ${g.title} | ${g.category} | ${g.layer} | ${g.severity} | ${g.priority} | ${g.owner} | ${g.status} |`);
md.push("");
const field = (label, v) => (Array.isArray(v) ? [`**${label}:**`, "", ...v.map((x) => `- ${x}`), ""] : [`**${label}:** ${v}`, ""]);
for (const g of reg.gaps) {
  md.push(`## ${g.id}`, "", `### ${g.title}`, "");
  md.push(`Discovered ${g.discovered} · ${g.category} · ${g.layer} · severity ${g.severity} · ${g.priority} · ${g.status}`, "");
  md.push(...field("Components", g.components), ...field("Description", g.description), ...field("Evidence", g.evidence));
  md.push(...field("What the developer wanted", g.wanted), ...field("What the platform provides", g.provided), ...field("Implemented manually", g.implementedManually));
  md.push(...field("Workaround", g.workaround), ...field("Custom LOC attributable", g.customLoc), ...field("Engineering time attributable", g.estimatedHours));
  md.push(...field("Kind of code", g.codeKind ?? "—"), ...field("If the platform provided it", g.codeFate), ...field("Proposed change", g.proposal), ...field("Architectural owner", g.owner));
  md.push(...field("Dependencies", g.dependencies.length ? g.dependencies.join(", ") : "none"));
}
if (reg.accounting) md.splice(8, 0, `**Gap-to-code accounting:** ${reg.accounting.attributedToGaps}. ${reg.accounting.wouldDisappear}. Method: ${reg.accounting.method}.`, "");
writeFileSync(new URL("../FELTKIT_GAP_REGISTER.md", import.meta.url), md.join("\n"));
console.log(`FELTKIT_GAP_REGISTER.md: ${reg.gaps.length} gaps`);
