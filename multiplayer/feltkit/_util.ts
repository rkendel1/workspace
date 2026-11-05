/** Small pure helpers shared by function modules. No Node APIs: the backend also runs in AppBoundry's WebAssembly guest. */
import { activity } from "./app.js";

export function record(ctx: { db: { insert(c: any, v: any): Promise<string> } }, workspaceId: string, actorId: string, type: string, summary: string, subjectId?: string) {
  return ctx.db.insert(activity, { workspaceId, actorId, type, summary: summary.slice(0, 300), ...(subjectId ? { subjectId } : {}), at: Date.now() });
}

/** "Ada Lovelace" / "ada@example.com" → "ada", lowercase letters, digits and dashes. */
export function baseHandle(source: string): string {
  const local = source.split("@")[0]!.split(/\s+/)[0]!;
  const h = local.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  return h || "user";
}

/** @handles mentioned in a message, lowercase, unique, in order. */
export function mentionedHandles(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(^|[^\w@])@([a-z0-9][a-z0-9-]{0,31})/gi)) {
    const h = m[2]!.toLowerCase();
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

export function channelName(name: string): string {
  return name.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? "=" : B64[c & 63]!;
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]!) : -1));
    out[o++] = (n[0]! << 2) | (n[1]! >> 4);
    if (n[2]! >= 0) out[o++] = ((n[1]! & 15) << 4) | (n[2]! >> 2);
    if (n[3]! >= 0) out[o++] = ((n[2]! & 3) << 6) | n[3]!;
  }
  return out.slice(0, o);
}
