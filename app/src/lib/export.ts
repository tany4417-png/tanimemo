import { strToU8, zipSync } from "fflate";
import { db } from "./db";
import { firstLineTitle } from "./markdown";
import type { Note } from "./types";

export function slugify(title: string): string {
  const s = title.replace(/[\\/:*?"<>|#\s]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 30) || "memo";
}

export function mimeToExt(mime: string): string {
  const map: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
  return map[mime] ?? "bin";
}

export function notePath(n: Note): string {
  const d = new Date(n.createdAt);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd}-${slugify(firstLineTitle(n.body))}-${n.id.slice(-4)}.md`;
}

export function noteContent(n: Note): string {
  return [
    "---",
    `tags: ${JSON.stringify(n.tags)}`,
    `importance: ${n.importance}`,
    `created: ${new Date(n.createdAt).toISOString()}`,
    `updated: ${new Date(n.updatedAt).toISOString()}`,
    "---",
    "",
    n.body,
    "",
  ].join("\n");
}

export async function exportZip(): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const notes = (await db.notes.toArray()).filter((n) => n.deleted === 0);
  for (const n of notes) files[notePath(n)] = strToU8(noteContent(n));
  const atts = (await db.attachments.toArray()).filter((a) => a.deleted === 0);
  for (const a of atts) {
    const rec = await db.attachmentBlobs.get(a.id);
    if (rec) files[`images/${a.id}.${mimeToExt(a.mime)}`] = new Uint8Array(await rec.blob.arrayBuffer());
  }
  return new Blob([zipSync(files)], { type: "application/zip" });
}
