import { strToU8, zipSync } from "fflate";
import { getImageBlob } from "./attachments";
import { db } from "./db";
import { folderPath } from "./folders";
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

export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function notePath(n: Note): string {
  return `${localYmd(new Date(n.createdAt))}-${slugify(firstLineTitle(n.body))}-${n.id.slice(-4)}.md`;
}

// folderPathStr: "仕事/2026" のような"/"結合済みフォルダパス。ルート("")のときはfolder行自体を省略する
export function noteContent(n: Note, folderPathStr = ""): string {
  return [
    "---",
    `tags: ${JSON.stringify(n.tags)}`,
    `importance: ${n.importance}`,
    ...(folderPathStr ? [`folder: ${folderPathStr}`] : []),
    `created: ${new Date(n.createdAt).toISOString()}`,
    `updated: ${new Date(n.updatedAt).toISOString()}`,
    "---",
    "",
    n.body,
    "",
  ].join("\n");
}

export async function exportZip(
  token = "",
  fetchFn: typeof fetch = fetch
): Promise<{ blob: Blob; missingImages: number }> {
  const files: Record<string, Uint8Array> = {};
  const notes = (await db.notes.toArray()).filter((n) => n.deleted === 0);
  for (const n of notes) {
    const path = await folderPath(n.folderId);
    const folderPathStr = path.map((f) => f.name).join("/");
    files[notePath(n)] = strToU8(noteContent(n, folderPathStr));
  }
  const atts = (await db.attachments.toArray()).filter((a) => a.deleted === 0);
  let missingImages = 0;
  for (const a of atts) {
    const rec = await db.attachmentBlobs.get(a.id);
    let blob = rec?.blob ?? null;
    if (!blob && token) blob = await getImageBlob(a.id, token, fetchFn);
    if (blob) {
      files[`images/${a.id}.${mimeToExt(a.mime)}`] = new Uint8Array(await blob.arrayBuffer());
    } else {
      missingImages += 1;
    }
  }
  return { blob: new Blob([zipSync(files)], { type: "application/zip" }), missingImages };
}
